import {
  DEFAULT_MICROPHONE_MODE,
  microphoneConstraints,
  type MicrophoneMode,
} from "./microphone-preference";
import {
  builtInInput,
  defaultInput,
  deviceName,
  inputDevices,
  type InputDevice,
} from "./microphone-devices";
import { VoiceInputError } from "./voice-errors";

export type MicrophoneCapture = {
  sampleRate: number;
  stop: () => void;
  /** Set when dictation switched away from an unresponsive default device. */
  notice?: string;
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

type SampleSink = (samples: Float32Array) => void;
type Capture = Omit<MicrophoneCapture, "notice">;

// With permission already granted a working device delivers audio within a
// second or two; otherwise the browser may be showing its permission prompt.
export const MICROPHONE_OPEN_TIMEOUT_MS = 5_000;
export const MICROPHONE_PROMPT_TIMEOUT_MS = 60_000;
// Matches the worklet's chunk size so both paths update the meter alike.
const CHUNK_SAMPLES = 2048;

// Capture requests cannot be aborted. On the worklet path a new dictation
// never starts while one is unresolved, because creating an AudioContext
// then can block the page.
const pendingRequests = new Set<Promise<unknown>>();
// The default device that last failed to respond. While it is still the
// default, dictation goes straight to the built-in microphone. Kept for the
// page's lifetime only, so a reload tries the default again.
let unresponsiveDefault: string | undefined;

export const startMicrophone: StartMicrophone = async (
  onSamples,
  mode = DEFAULT_MICROPHONE_MODE,
) => {
  if (
    typeof window === "undefined" ||
    !navigator.mediaDevices?.getUserMedia ||
    (!trackProcessorSupported() && typeof AudioWorkletNode === "undefined")
  ) {
    throw new VoiceInputError(
      "microphone_unsupported",
      "This browser cannot record audio",
    );
  }
  // Reading the track directly needs no AudioContext, so only the worklet
  // path has to wait out a stuck request.
  if (!trackProcessorSupported() && pendingRequests.size > 0) {
    throw new VoiceInputError(
      "microphone_busy",
      "The microphone is still starting from the last try. Check the input device in your system sound settings, or reload the page",
    );
  }
  const granted = (await microphonePermission()) === "granted";
  // Labels, and so fallback, are only available once permission is granted.
  const devices = granted ? await listInputs() : [];
  const current = defaultInput(devices);
  const builtIn = builtInInput(devices, current);
  const switched = (from: InputDevice, to: InputDevice) =>
    `${deviceName(from)} did not respond, so dictation is using ${deviceName(to)}.`;

  if (current && builtIn && unresponsiveDefault === current.label) {
    const capture = await openCapture(
      onSamples,
      mode,
      builtIn.deviceId,
      MICROPHONE_OPEN_TIMEOUT_MS,
    );
    return { ...capture, notice: switched(current, builtIn) };
  }
  try {
    const capture = await openCapture(
      onSamples,
      mode,
      undefined,
      granted ? MICROPHONE_OPEN_TIMEOUT_MS : MICROPHONE_PROMPT_TIMEOUT_MS,
    );
    if (current && unresponsiveDefault === current.label) {
      unresponsiveDefault = undefined;
    }
    return capture;
  } catch (error) {
    if (
      !(error instanceof VoiceInputError) ||
      error.code !== "microphone_unresponsive" ||
      !current ||
      !builtIn
    ) {
      throw error;
    }
    unresponsiveDefault = current.label;
    const capture = await openCapture(
      onSamples,
      mode,
      builtIn.deviceId,
      MICROPHONE_OPEN_TIMEOUT_MS,
    );
    return { ...capture, notice: switched(current, builtIn) };
  }
};

/**
 * Opens one device and starts capture, failing with microphone_unresponsive
 * when no audio arrives in time. A device that opens after that is released.
 */
async function openCapture(
  onSamples: SampleSink,
  mode: MicrophoneMode,
  deviceId: string | undefined,
  timeoutMs: number,
): Promise<Capture> {
  const constraints: MediaTrackConstraints = microphoneConstraints(mode);
  if (deviceId) constraints.deviceId = { exact: deviceId };
  const request = navigator.mediaDevices.getUserMedia({ audio: constraints });
  const settled = request.then(
    () => undefined,
    () => undefined,
  );
  pendingRequests.add(settled);
  void settled.then(() => pendingRequests.delete(settled));

  let abandoned = false;
  const capture = request.then(async (stream) => {
    // A late stream is released below, together with the timeout.
    if (abandoned) throw new Error("abandoned");
    try {
      return trackProcessorSupported()
        ? await processorCapture(stream, onSamples)
        : await workletCapture(stream, onSamples);
    } catch (error) {
      stopTracks(stream);
      throw error;
    }
  });
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
    return await Promise.race([capture, timeout]);
  } catch (error) {
    abandoned = true;
    // Stopping the tracks also ends a processor still waiting for audio.
    void request.then(stopTracks, () => undefined);
    void capture.then(
      (late) => late.stop(),
      () => undefined,
    );
    throw microphoneError(error);
  } finally {
    clearTimeout(timer);
  }
}

// Chrome reads the track directly, without an AudioContext. Resolves once the
// first audio arrives, which proves the device is actually delivering.
type AudioFrame = {
  sampleRate: number;
  numberOfFrames: number;
  copyTo: (
    destination: Float32Array,
    options: { planeIndex: number; format: "f32-planar" },
  ) => void;
  close: () => void;
};
type FrameReader = {
  read: () => Promise<{ done: boolean; value?: AudioFrame }>;
  cancel: () => Promise<void>;
};
type TrackProcessorConstructor = new (init: { track: MediaStreamTrack }) => {
  readable: { getReader: () => FrameReader };
};

function trackProcessor() {
  return (
    globalThis as { MediaStreamTrackProcessor?: TrackProcessorConstructor }
  ).MediaStreamTrackProcessor;
}

function trackProcessorSupported() {
  return typeof trackProcessor() === "function";
}

async function processorCapture(
  stream: MediaStream,
  onSamples: SampleSink,
): Promise<Capture> {
  const Processor = trackProcessor()!;
  const [track] = stream.getAudioTracks();
  const reader = new Processor({ track }).readable.getReader();
  let stopped = false;
  let chunk = new Float32Array(CHUNK_SAMPLES);
  let length = 0;
  const take = (frame: AudioFrame) => {
    const samples = new Float32Array(frame.numberOfFrames);
    frame.copyTo(samples, { planeIndex: 0, format: "f32-planar" });
    frame.close();
    for (let offset = 0; offset < samples.length; ) {
      const count = Math.min(samples.length - offset, CHUNK_SAMPLES - length);
      chunk.set(samples.subarray(offset, offset + count), length);
      length += count;
      offset += count;
      if (length === CHUNK_SAMPLES) {
        if (!stopped) onSamples(chunk);
        chunk = new Float32Array(CHUNK_SAMPLES);
        length = 0;
      }
    }
  };
  const first = await reader.read();
  if (first.done || !first.value) {
    throw new VoiceInputError(
      "microphone_failed",
      "The microphone could not be started",
    );
  }
  const sampleRate = first.value.sampleRate;
  take(first.value);
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done || !value) return;
        if (stopped) {
          value.close();
          return;
        }
        take(value);
      }
    } catch {
      // The track ended or was stopped.
    }
  })();
  return {
    sampleRate,
    stop() {
      if (stopped) return;
      stopped = true;
      void reader.cancel().catch(() => undefined);
      stopTracks(stream);
    },
  };
}

// Other browsers capture through an AudioWorklet. The context is created only
// once the microphone is open: while a capture request is unresolved Chrome
// on macOS blocks the page inside the AudioContext constructor, and active
// capture lets Safari start a context created after the click.
async function workletCapture(
  stream: MediaStream,
  onSamples: SampleSink,
): Promise<Capture> {
  const context = new AudioContext();
  try {
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
    let stopped = false;
    return {
      sampleRate: context.sampleRate,
      stop() {
        if (stopped) return;
        stopped = true;
        node.port.onmessage = null;
        source.disconnect();
        node.disconnect();
        stopTracks(stream);
        void context.close().catch(() => undefined);
      },
    };
  } catch (error) {
    void context.close().catch(() => undefined);
    throw error;
  }
}

async function listInputs() {
  try {
    return inputDevices(await navigator.mediaDevices.enumerateDevices());
  } catch {
    return [];
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
