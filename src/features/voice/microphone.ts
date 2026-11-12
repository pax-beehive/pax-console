import { VoiceInputError } from "./voice-errors";

export type MicrophoneCapture = {
  sampleRate: number;
  stop: () => void;
};

export type StartMicrophone = (
  onSamples: (samples: Float32Array) => void,
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

export const startMicrophone: StartMicrophone = async (onSamples) => {
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
  // Create the context before the permission prompt so it is still tied to
  // the click; Safari keeps contexts created later suspended.
  const context = new AudioContext();
  void context.resume().catch(() => undefined);
  let stream: MediaStream | undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
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
    let stopped = false;
    return {
      sampleRate: context.sampleRate,
      stop() {
        if (stopped) return;
        stopped = true;
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        tracks.forEach((track) => track.stop());
        void context.close().catch(() => undefined);
      },
    };
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    void context.close().catch(() => undefined);
    throw microphoneError(error);
  }
};

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
