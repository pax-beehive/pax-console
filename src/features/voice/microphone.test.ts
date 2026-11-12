import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Deferred = {
  resolve: (stream: MediaStream) => void;
  reject: (error: unknown) => void;
  deviceId?: string;
};

let requests: Deferred[];
let contexts: number;
let permission: PermissionState;
let devices: Partial<MediaDeviceInfo>[];
const trackStops: number[] = [];

function fakeStream() {
  const track = { stop: () => trackStops.push(1) };
  return {
    getTracks: () => [track],
    getAudioTracks: () => [track],
  } as unknown as MediaStream;
}

class FakeAudioContext {
  sampleRate = 48_000;
  destination = {};
  audioWorklet = { addModule: async () => undefined };
  constructor() {
    contexts++;
  }
  createMediaStreamSource() {
    return { connect: () => undefined, disconnect: () => undefined };
  }
  resume = async () => undefined;
  close = async () => undefined;
}

class FakeWorkletNode {
  port = { onmessage: null };
  connect() {}
  disconnect() {}
}

async function loadMicrophone() {
  vi.resetModules();
  return import("./microphone");
}

beforeEach(() => {
  requests = [];
  contexts = 0;
  permission = "granted";
  devices = [];
  trackStops.length = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:worklet");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: ({ audio }: { audio: MediaTrackConstraints }) =>
        new Promise<MediaStream>((resolve, reject) =>
          requests.push({
            resolve,
            reject,
            deviceId: (audio.deviceId as { exact?: string } | undefined)?.exact,
          }),
        ),
      enumerateDevices: async () => devices,
    },
    permissions: { query: async () => ({ state: permission }) },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("startMicrophone", () => {
  it("creates the audio context only after the microphone opens", async () => {
    const { startMicrophone } = await loadMicrophone();
    const capture = startMicrophone(() => undefined);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    expect(contexts).toBe(0);
    requests[0].resolve(fakeStream());
    const mic = await capture;
    expect(contexts).toBe(1);
    expect(mic.sampleRate).toBe(48_000);
    mic.stop();
    expect(trackStops).toHaveLength(1);
  });

  it("times out a microphone that never opens and refuses a second request", async () => {
    vi.useFakeTimers();
    const { startMicrophone, MICROPHONE_OPEN_TIMEOUT_MS } =
      await loadMicrophone();
    const first = startMicrophone(() => undefined);
    const failure = expect(first).rejects.toMatchObject({
      code: "microphone_unresponsive",
    });
    await vi.advanceTimersByTimeAsync(MICROPHONE_OPEN_TIMEOUT_MS);
    await failure;

    // The stuck request is still pending, so no new one is started.
    await expect(startMicrophone(() => undefined)).rejects.toMatchObject({
      code: "microphone_busy",
    });
    expect(requests).toHaveLength(1);
    expect(contexts).toBe(0);

    // When it finally opens, the stream is released and dictation works again.
    requests[0].resolve(fakeStream());
    await vi.advanceTimersByTimeAsync(0);
    expect(trackStops).toHaveLength(1);
    const next = startMicrophone(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    requests[1].resolve(fakeStream());
    await expect(next).resolves.toMatchObject({ sampleRate: 48_000 });
  });

  it("waits longer while the browser may be asking for permission", async () => {
    vi.useFakeTimers();
    permission = "prompt";
    const { startMicrophone, MICROPHONE_OPEN_TIMEOUT_MS } =
      await loadMicrophone();
    const capture = startMicrophone(() => undefined);
    await vi.advanceTimersByTimeAsync(MICROPHONE_OPEN_TIMEOUT_MS * 2);
    requests[0].resolve(fakeStream());
    await expect(capture).resolves.toMatchObject({ sampleRate: 48_000 });
  });

  it("reports a denied permission", async () => {
    const { startMicrophone } = await loadMicrophone();
    const capture = startMicrophone(() => undefined);
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].reject(new DOMException("denied", "NotAllowedError"));
    await expect(capture).rejects.toMatchObject({ code: "microphone_denied" });
  });

  it("retries with the built-in microphone when the default never responds", async () => {
    vi.useFakeTimers();
    devices = macDevices;
    const { startMicrophone, MICROPHONE_OPEN_TIMEOUT_MS } =
      await loadMicrophone();
    const first = startMicrophone(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
    expect(requests[0].deviceId).toBeUndefined();
    await vi.advanceTimersByTimeAsync(MICROPHONE_OPEN_TIMEOUT_MS);
    expect(requests).toHaveLength(2);
    expect(requests[1].deviceId).toBe("mac-mic");
    requests[1].resolve(fakeStream());
    await expect(first).resolves.toMatchObject({
      notice:
        "AirPods Max did not respond, so dictation is using MacBook Air Microphone.",
    });

    // While that device is still the default, the next try skips it. (The
    // stuck request settles first: without Chrome's track processor a new
    // dictation waits for it.)
    requests[0].reject(new DOMException("gone", "AbortError"));
    await vi.advanceTimersByTimeAsync(0);
    const second = startMicrophone(() => undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(3);
    expect(requests[2].deviceId).toBe("mac-mic");
    requests[2].resolve(fakeStream());
    await expect(second).resolves.toMatchObject({
      notice: expect.stringContaining("MacBook Air Microphone"),
    });
  });

  it("does not switch when the default is already the built-in microphone", async () => {
    vi.useFakeTimers();
    devices = [
      {
        kind: "audioinput",
        deviceId: "default",
        groupId: "g-mac",
        label: "Default - MacBook Air Microphone (Built-in)",
      },
      ...macDevices.slice(1),
    ];
    const { startMicrophone, MICROPHONE_OPEN_TIMEOUT_MS } =
      await loadMicrophone();
    const capture = startMicrophone(() => undefined);
    const failure = expect(capture).rejects.toMatchObject({
      code: "microphone_unresponsive",
    });
    await vi.advanceTimersByTimeAsync(MICROPHONE_OPEN_TIMEOUT_MS);
    await failure;
    expect(requests).toHaveLength(1);
  });

  it("reads the track directly in Chrome, without an AudioContext", async () => {
    const frames: {
      resolve: (r: { done: boolean; value?: unknown }) => void;
    }[] = [];
    let cancelled = false;
    const frame = (n: number) => ({
      sampleRate: 48_000,
      numberOfFrames: n,
      copyTo: (dest: Float32Array) => dest.fill(0.25),
      close: () => undefined,
    });
    vi.stubGlobal(
      "MediaStreamTrackProcessor",
      class {
        readable = {
          getReader: () => ({
            read: () => new Promise((resolve) => frames.push({ resolve })),
            cancel: async () => {
              cancelled = true;
            },
          }),
        };
      },
    );
    const chunks: Float32Array[] = [];
    const { startMicrophone } = await loadMicrophone();
    const capture = startMicrophone((samples) => chunks.push(samples));
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    requests[0].resolve(fakeStream());
    await vi.waitFor(() => expect(frames).toHaveLength(1));
    frames[0].resolve({ done: false, value: frame(1_500) });
    const mic = await capture;
    expect(mic.sampleRate).toBe(48_000);
    expect(contexts).toBe(0);
    expect(chunks).toHaveLength(0);
    await vi.waitFor(() => expect(frames).toHaveLength(2));
    frames[1].resolve({ done: false, value: frame(1_000) });
    await vi.waitFor(() => expect(chunks).toHaveLength(1));
    expect(chunks[0]).toHaveLength(2_048);
    expect(chunks[0][0]).toBe(0.25);
    mic.stop();
    expect(cancelled).toBe(true);
    expect(trackStops).toHaveLength(1);
  });
});

const macDevices: Partial<MediaDeviceInfo>[] = [
  {
    kind: "audioinput",
    deviceId: "default",
    groupId: "g-pods",
    label: "Default - AirPods Max (Bluetooth)",
  },
  {
    kind: "audioinput",
    deviceId: "pods",
    groupId: "g-pods",
    label: "AirPods Max (Bluetooth)",
  },
  {
    kind: "audioinput",
    deviceId: "phone",
    groupId: "g-phone",
    label: "iPhone Microphone",
  },
  {
    kind: "audioinput",
    deviceId: "mac-mic",
    groupId: "g-mac",
    label: "MacBook Air Microphone (Built-in)",
  },
  {
    kind: "audiooutput",
    deviceId: "speakers",
    groupId: "g-mac",
    label: "MacBook Air Speakers (Built-in)",
  },
];
