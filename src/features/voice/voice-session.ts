import {
  startMicrophone as defaultStartMicrophone,
  type MicrophoneCapture,
  type StartMicrophone,
} from "./microphone";
import { audioLevel, concatPcm, PcmResampler } from "./pcm";
import { serverVoiceError, VoiceInputError } from "./voice-errors";
import {
  parseVoiceServerMessage,
  type VoiceServerMessage,
  type VoiceStartMessage,
} from "./voice-protocol";

export type VoicePhase = "connecting" | "recording" | "finishing";

export type VoiceHints = {
  keywords?: string[];
  context?: string[];
};

export type VoiceSessionResult = {
  /** Full transcript, present when the server finished normally. */
  text?: string;
  error?: VoiceInputError;
};

export type VoiceSessionOptions = {
  url: string;
  hints?: VoiceHints;
  onPhase: (phase: VoicePhase) => void;
  onTranscript: (final: string, partial: string) => void;
  onLevel?: (level: number) => void;
  /** Called exactly once, after which the session holds no resources. */
  onEnd: (result: VoiceSessionResult) => void;
  createSocket?: (url: string) => WebSocket;
  startMicrophone?: StartMicrophone;
};

const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
// ~100 ms frames keep latency low without flooding the socket.
const FRAME_SECONDS = 0.1;
// Audio captured before the server is ready is kept for up to 5 seconds so
// the first words are not lost while the provider connects.
const MAX_EARLY_SECONDS = 5;
// The manager gives the provider 15 seconds to finish; this only guards
// against a connection that silently stops responding.
const FINISH_TIMEOUT_MS = 25_000;

/**
 * One dictation: microphone capture, PCM conversion, and the manager voice
 * stream. Keeps raw audio and protocol frames out of React components.
 */
export class VoiceSession {
  private socket?: WebSocket;
  private socketOpened = false;
  private microphone?: MicrophoneCapture;
  private resampler?: PcmResampler;
  private frameSamples = 0;
  private outgoing: Int16Array[] = [];
  private outgoingSamples = 0;
  private early: Float32Array[] = [];
  private earlySamples = 0;
  private ready = false;
  private stopRequested = false;
  private ended = false;
  private finishTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly options: VoiceSessionOptions) {}

  async start() {
    this.options.onPhase("connecting");
    const startMicrophone =
      this.options.startMicrophone ?? defaultStartMicrophone;
    let microphone: MicrophoneCapture;
    try {
      microphone = await startMicrophone((samples) => this.capture(samples));
    } catch (error) {
      this.end({ error: asVoiceError(error) });
      return;
    }
    if (this.ended || this.stopRequested) {
      microphone.stop();
      this.end({});
      return;
    }
    this.microphone = microphone;
    this.connect();
  }

  /** Stops recording and waits for the final transcript. */
  stop() {
    if (this.ended || this.stopRequested) return;
    this.stopRequested = true;
    this.microphone?.stop();
    this.options.onPhase("finishing");
    this.finishTimer = setTimeout(
      () =>
        this.end({
          error: new VoiceInputError(
            "timeout",
            "Speech recognition did not finish in time",
          ),
        }),
      FINISH_TIMEOUT_MS,
    );
    // Before ready the stop is sent right after the buffered audio.
    if (this.ready) this.sendStop();
  }

  /** Abandons the session without waiting for a result. */
  cancel() {
    if (this.ended) return;
    if (this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(JSON.stringify({ type: "cancel" }));
    }
    this.end({});
  }

  private connect() {
    const createSocket =
      this.options.createSocket ?? ((url: string) => new WebSocket(url));
    const socket = createSocket(this.options.url);
    socket.binaryType = "arraybuffer";
    this.socket = socket;
    socket.onopen = () => {
      this.socketOpened = true;
      const start: VoiceStartMessage = { type: "start", ...this.options.hints };
      socket.send(JSON.stringify(start));
    };
    socket.onmessage = (event: MessageEvent) => {
      const message = parseVoiceServerMessage(event.data);
      if (message) this.receive(message);
    };
    // A failed handshake or dropped connection always ends in close.
    socket.onclose = () =>
      this.end({
        error: this.socketOpened
          ? new VoiceInputError("connection_lost", "Voice input disconnected")
          : new VoiceInputError(
              "connection_failed",
              "Could not connect to voice input",
            ),
      });
  }

  private receive(message: VoiceServerMessage) {
    switch (message.type) {
      case "ready":
        this.onReady(message.sampleRate);
        return;
      case "transcript":
        this.options.onTranscript(message.final, message.partial);
        return;
      case "done":
        this.end({ text: message.final });
        return;
      case "error":
        this.end({ error: serverVoiceError(message.code) });
    }
  }

  private onReady(sampleRate: number) {
    if (this.ready || !this.microphone) return;
    this.ready = true;
    this.resampler = new PcmResampler(this.microphone.sampleRate, sampleRate);
    this.frameSamples = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
    const early = this.early;
    this.early = [];
    this.earlySamples = 0;
    early.forEach((samples) => this.forward(samples));
    if (this.stopRequested) this.sendStop();
    else this.options.onPhase("recording");
  }

  private capture(samples: Float32Array) {
    if (this.ended || this.stopRequested) return;
    this.options.onLevel?.(audioLevel(samples));
    if (this.ready) {
      this.forward(samples);
      return;
    }
    const limit = (this.microphone?.sampleRate ?? 48_000) * MAX_EARLY_SECONDS;
    if (this.earlySamples + samples.length <= limit) {
      this.early.push(samples);
      this.earlySamples += samples.length;
    }
  }

  private forward(samples: Float32Array) {
    const pcm = this.resampler!.process(samples);
    if (pcm.length === 0) return;
    this.outgoing.push(pcm);
    this.outgoingSamples += pcm.length;
    if (this.outgoingSamples >= this.frameSamples) this.flush();
  }

  private flush() {
    if (this.outgoingSamples === 0 || this.socket?.readyState !== SOCKET_OPEN)
      return;
    this.socket.send(concatPcm(this.outgoing).buffer);
    this.outgoing = [];
    this.outgoingSamples = 0;
  }

  private sendStop() {
    this.flush();
    if (this.socket?.readyState === SOCKET_OPEN) {
      this.socket.send(JSON.stringify({ type: "stop" }));
    }
  }

  private end(result: VoiceSessionResult) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.finishTimer);
    this.microphone?.stop();
    const socket = this.socket;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      if (
        socket.readyState === SOCKET_CONNECTING ||
        socket.readyState === SOCKET_OPEN
      ) {
        socket.close();
      }
    }
    this.options.onEnd(result);
  }
}

function asVoiceError(error: unknown) {
  return error instanceof VoiceInputError
    ? error
    : new VoiceInputError(
        "microphone_failed",
        "The microphone could not be started",
      );
}
