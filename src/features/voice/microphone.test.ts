import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Deferred = {
  resolve: (stream: MediaStream) => void;
  reject: (error: unknown) => void;
};

let requests: Deferred[];
let contexts: number;
let permission: PermissionState;
const trackStops: number[] = [];

function fakeStream() {
  const track = { stop: () => trackStops.push(1) };
  return { getTracks: () => [track] } as unknown as MediaStream;
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
  trackStops.length = 0;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("AudioWorkletNode", FakeWorkletNode);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:worklet");
  vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: () =>
        new Promise<MediaStream>((resolve, reject) =>
          requests.push({ resolve, reject }),
        ),
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
});
