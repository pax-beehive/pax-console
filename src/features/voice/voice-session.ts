import {
  startMicrophone as defaultStartMicrophone,
  type MicrophoneCapture,
  type StartMicrophone,
} from "./microphone";
import type { MicrophoneMode } from "./microphone-preference";
import { joinTranscript } from "./dictation-text";
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
  microphoneMode?: MicrophoneMode;
  hints?: VoiceHints;
  onPhase: (phase: VoicePhase) => void;
  onTranscript: (final: string, partial: string) => void;
  onLevel?: (level: number) => void;
  /** Something the user should know that does not stop dictation. */
  onNotice?: (message: string) => void;
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
// From opening the socket until the manager reports ready.
export const READY_TIMEOUT_MS = 10_000;
// Connections that drop while recording are reopened this many times per
// dictation. Audio captured meanwhile is buffered like before the first ready.
export const MAX_RECONNECTS = 3;

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
  private readyTimer?: ReturnType<typeof setTimeout>;
  private recording = false;
  private reconnects = 0;
  // Text recognized by earlier connections of this dictation.
  private committed = "";
  // The latest snapshot from the current connection.
  private final = "";
  private partial = "";

  constructor(private readonly options: VoiceSessionOptions) {}

  async start() {
    this.options.onPhase("connecting");
    const startMicrophone =
      this.options.startMicrophone ?? defaultStartMicrophone;
    let microphone: MicrophoneCapture;
    try {
      microphone = await startMicrophone(
        (samples) => this.capture(samples),
        this.options.microphoneMode,
      );
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
    if (microphone.notice) this.options.onNotice?.(microphone.notice);
    this.connect();
  }

  /** Stops recording and waits for the final transcript. */
  stop() {
    if (this.ended || this.stopRequested) return;
    this.stopRequested = true;
    // Still waiting for the microphone: nothing was recorded, so end now
    // instead of waiting for a device that may never open.
    if (!this.microphone) {
      this.end({});
      return;
    }
    this.microphone.stop();
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
    this.readyTimer = setTimeout(
      () =>
        this.end({
          error: new VoiceInputError(
            "connection_failed",
            "Voice input did not respond. Try again",
          ),
        }),
      READY_TIMEOUT_MS,
    );
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
    socket.onclose = () => {
      if (this.reconnect()) return;
      this.end({
        error: this.socketOpened
          ? new VoiceInputError("connection_lost", "Voice input disconnected")
          : new VoiceInputError(
              "connection_failed",
              "Could not connect to voice input",
            ),
      });
    };
  }

  /**
   * Reopens the stream after a drop while recording, keeping what was
   * recognized so far. After stop the remaining audio already went to the
   * lost connection, so a drop then still ends the dictation.
   */
  private reconnect() {
    if (
      this.ended ||
      this.stopRequested ||
      !this.ready ||
      this.reconnects >= MAX_RECONNECTS
    ) {
      return false;
    }
    this.reconnects += 1;
    this.committed = this.transcript(this.partial);
    this.final = "";
    this.partial = "";
    this.ready = false;
    this.socketOpened = false;
    clearTimeout(this.readyTimer);
    this.detach(this.socket);
    this.connect();
    return true;
  }

  private transcript(partial: string) {
    return joinTranscript(this.committed, joinTranscript(this.final, partial));
  }

  private receive(message: VoiceServerMessage) {
    switch (message.type) {
      case "ready":
        this.onReady(message.sampleRate);
        return;
      case "transcript":
        this.final = message.final;
        this.partial = message.partial;
        this.options.onTranscript(
          joinTranscript(this.committed, message.final),
          message.partial,
        );
        return;
      case "done":
        this.end({ text: joinTranscript(this.committed, message.final) });
        return;
      case "error":
        // The provider dropping mid-dictation is handled like a lost
        // connection; other errors end the dictation.
        if (message.code === "provider_failed" && this.reconnect()) return;
        this.end({ error: serverVoiceError(message.code) });
    }
  }

  private onReady(sampleRate: number) {
    if (this.ready || !this.microphone) return;
    this.ready = true;
    clearTimeout(this.readyTimer);
    this.resampler = new PcmResampler(this.microphone.sampleRate, sampleRate);
    this.frameSamples = Math.max(1, Math.round(sampleRate * FRAME_SECONDS));
    const early = this.early;
    this.early = [];
    this.earlySamples = 0;
    early.forEach((samples) => this.forward(samples));
    if (this.stopRequested) {
      this.sendStop();
    } else if (!this.recording) {
      // Only once, so a reconnect does not restart the timer.
      this.recording = true;
      this.options.onPhase("recording");
    }
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
    clearTimeout(this.readyTimer);
    this.microphone?.stop();
    this.detach(this.socket);
    this.options.onEnd(result);
  }

  /** Stops listening to a socket and closes it if it is still open. */
  private detach(socket: WebSocket | undefined) {
    if (!socket) return;
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
}

function asVoiceError(error: unknown) {
  return error instanceof VoiceInputError
    ? error
    : new VoiceInputError(
        "microphone_failed",
        "The microphone could not be started",
      );
}
