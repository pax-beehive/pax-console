import {
  DEFAULT_MICROPHONE_MODE,
  microphoneConstraints,
  type MicrophoneMode,
} from "./microphone-preference";
import { VoiceInputError } from "./voice-errors";

export type MicrophoneCapture = {
  sampleRate: number;
  stop: () => void;
};

export type StartMicrophone = (
  onSamples: (samples: Float32Array) => void,
  mode?: MicrophoneMode,
) => Promise<MicrophoneCapture>;

// Batches render quanta (128 frames) into ~40 ms chunks before posting them
// to the main thread.
const CAPTURE_WORKLET_SOURCE = `
class PaxVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(2048);
    this.length = 0;
  }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      for (let i = 0; i < channel.length; i++) {
        this.buffer[this.length++] = channel[i];
        if (this.length === this.buffer.length) {
          this.port.postMessage(this.buffer, [this.buffer.buffer]);
          this.buffer = new Float32Array(2048);
          this.length = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pax-voice-capture", PaxVoiceCapture);
`;

export const startMicrophone: StartMicrophone = async (
  onSamples,
  mode = DEFAULT_MICROPHONE_MODE,
) => {
  if (
    typeof window === "undefined" ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof AudioWorkletNode === "undefined"
  ) {
    throw new VoiceInputError(
      "microphone_unsupported",
      "This browser cannot record audio",
    );
  }
  const stream = await requestStream(mode);
  // Only create the context once the microphone is open. While a capture
  // request is stuck (for example on an input device that never delivers
  // audio), Chrome on macOS blocks the page's main thread inside the
  // AudioContext constructor. Active capture also lets Safari start it.
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    const moduleUrl = URL.createObjectURL(
      new Blob([CAPTURE_WORKLET_SOURCE], { type: "application/javascript" }),
    );
    try {
      await context.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, "pax-voice-capture");
    node.port.onmessage = (event: MessageEvent<Float32Array>) =>
      onSamples(event.data);
    source.connect(node);
    // The node writes no output; connecting it keeps the graph pulling it.
    node.connect(context.destination);
    await context.resume();
    const tracks = stream.getTracks();
    const openContext = context;
    let stopped = false;
    return {
      sampleRate: openContext.sampleRate,
      stop() {
        if (stopped) return;
        stopped = true;
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        tracks.forEach((track) => track.stop());
        void openContext.close().catch(() => undefined);
      },
    };
  } catch (error) {
    stopTracks(stream);
    void context?.close().catch(() => undefined);
    throw microphoneError(error);
  }
};

// With permission already granted the device should open within seconds;
// otherwise the browser may be showing its permission prompt.
export const MICROPHONE_OPEN_TIMEOUT_MS = 8_000;
export const MICROPHONE_PROMPT_TIMEOUT_MS = 60_000;

// A capture request cannot be aborted. While one is still unresolved, a new
// one would queue behind it and audio APIs can block the page, so dictation
// refuses to start again until it settles.
let pendingRequest: Promise<unknown> | undefined;

async function requestStream(mode: MicrophoneMode): Promise<MediaStream> {
  if (pendingRequest) {
    throw new VoiceInputError(
      "microphone_busy",
      "The microphone is still starting from the last try. Check the input device in your system sound settings, or reload the page",
    );
  }
  const request = navigator.mediaDevices.getUserMedia({
    audio: microphoneConstraints(mode),
  });
  const settled = request.then(
    () => undefined,
    () => undefined,
  );
  pendingRequest = settled;
  void settled.then(() => {
    if (pendingRequest === settled) pendingRequest = undefined;
  });
  const timeoutMs =
    (await microphonePermission()) === "granted"
      ? MICROPHONE_OPEN_TIMEOUT_MS
      : MICROPHONE_PROMPT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new VoiceInputError(
            "microphone_unresponsive",
            "The microphone did not start. Check the input device in your system sound settings",
          ),
        ),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([request, timeout]);
  } catch (error) {
    // A stream that opens after we gave up must not keep the mic on.
    void request.then(stopTracks, () => undefined);
    throw microphoneError(error);
  } finally {
    clearTimeout(timer);
  }
}

async function microphonePermission(): Promise<PermissionState | undefined> {
  try {
    const status = await navigator.permissions?.query({
      name: "microphone" as PermissionName,
    });
    return status?.state;
  } catch {
    return undefined;
  }
}

function stopTracks(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
}

function microphoneError(error: unknown) {
  if (error instanceof VoiceInputError) return error;
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new VoiceInputError(
      "microphone_denied",
      "Microphone access was blocked. Allow it in the browser to dictate",
    );
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return new VoiceInputError("microphone_missing", "No microphone was found");
  }
  return new VoiceInputError(
    "microphone_failed",
    "The microphone could not be started",
  );
}
