import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mobileControl, readMobileRecording } from "./api";

const fetch = vi.hoisted(() => vi.fn());
vi.mock("@/features/api/client", () => ({
  apiFetch: fetch,
  userPath: (user: string, path: string) => `/api/v1/user/${user}${path}`,
}));

beforeEach(() => fetch.mockReset());
afterEach(() => vi.restoreAllMocks());

it("uses only the same-origin node mobile endpoint and never retries an uncertain input", async () => {
  fetch.mockRejectedValueOnce(new Error("Connection lost"));
  await expect(
    mobileControl("self", "node/1", "tap", {
      sessionId: "phone",
      frameId: "frame",
      x: 3,
      y: 4,
    }),
  ).rejects.toThrow("Connection lost");
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe(
    "/api/v1/user/self/nodes/node%2F1/daemon/mobile",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    operation: "tap",
    payload: { sessionId: "phone", frameId: "frame", x: 3, y: 4 },
  });
});

it("serializes node operations and discards an aborted read before it reaches the bridge", async () => {
  let release!: (value: unknown) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = mobileControl("u", "n", "start", { sessionId: "phone" });
  const abort = new AbortController();
  const second = mobileControl(
    "u",
    "n",
    "screenshot",
    { sessionId: "phone" },
    abort.signal,
  );
  const rejected = expect(second).rejects.toThrow();
  await Promise.resolve();
  expect(fetch).toHaveBeenCalledOnce();
  abort.abort();
  release({ mobile_control: { state: "running" } });
  await first;
  await rejected;
  expect(fetch).toHaveBeenCalledOnce();
});

it("never dispatches an input cancelled while another panel owns the node queue", async () => {
  let release!: (value: unknown) => void;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const read = mobileControl("u", "queued", "recording_list", {
    sessionId: "other-phone",
  });
  const hidden = new AbortController();
  const input = mobileControl(
    "u",
    "queued",
    "key",
    { sessionId: "phone", frameId: "fresh", key: "BACK" },
    hidden.signal,
  );
  const rejected = expect(input).rejects.toThrow();
  await Promise.resolve();
  hidden.abort();
  release({ mobile_control: [] });
  await read;
  await rejected;
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(fetch.mock.calls[0][1].body).operation).toBe(
    "recording_list",
  );
});

describe("response boundary", () => {
  it("accepts complex screenshots above one MiB while retaining the four MiB response boundary", async () => {
    const frame = {
      mime: "image/png",
      data: "Y".repeat(1100000),
      frameId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      width: 1080,
      height: 1920,
    };
    fetch.mockResolvedValueOnce({ mobile_control: frame });
    await expect(mobileControl("u", "n", "screenshot")).resolves.toEqual(frame);
    fetch.mockResolvedValueOnce({
      mobile_control: { ...frame, data: "Y".repeat(4 * 1024 * 1024) },
    });
    await expect(mobileControl("u", "n", "screenshot")).rejects.toThrow(
      "no usable screenshot",
    );
  });
  it("rejects malformed state and does not offer remote WebRTC", async () => {
    for (const value of [
      {},
      { sessions: [], templates: [], remoteWebRTC: true },
    ]) {
      fetch.mockResolvedValueOnce({ mobile_control: value });
      await expect(mobileControl("u", "n", "state")).rejects.toThrow(
        "Update and restart",
      );
    }
  });
  it("rejects unbound or malformed screenshots before rendering", async () => {
    const frame = {
      mime: "image/png",
      data: "YWJj",
      frameId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      width: 10,
      height: 20,
    };
    for (const value of [
      { ...frame, frameId: "" },
      { ...frame, mime: "image/svg+xml" },
      { ...frame, width: Infinity },
      { ...frame, data: "https://host/secret" },
    ]) {
      fetch.mockResolvedValueOnce({ mobile_control: value });
      await expect(mobileControl("u", "n", "screenshot")).rejects.toThrow(
        "no usable screenshot",
      );
    }
  });
});

it("gives cold boot its bounded deadline while retaining caller cancellation", async () => {
  const timeout = vi.spyOn(AbortSignal, "timeout");
  fetch.mockResolvedValue({ mobile_control: {} });
  const caller = new AbortController();
  await mobileControl("u", "n", "start", { sessionId: "phone" }, caller.signal);
  expect(timeout).toHaveBeenLastCalledWith(720000);
  const signal = fetch.mock.calls[0][1].signal as AbortSignal;
  expect(signal.aborted).toBe(false);
  caller.abort();
  expect(signal.aborted).toBe(true);
});

it("assembles a completed recording from identity-bound bounded chunks", async () => {
  fetch.mockResolvedValueOnce({
    mobile_control: {
      id: "record",
      mime: "audio/ogg",
      data: "YWJj",
      offset: 0,
      length: 3,
      totalBytes: 5,
      eof: false,
    },
  });
  fetch.mockResolvedValueOnce({
    mobile_control: {
      id: "record",
      mime: "audio/ogg",
      data: "ZGU=",
      offset: 3,
      length: 2,
      totalBytes: 5,
      eof: true,
    },
  });
  const progress = vi.fn();
  const result = await readMobileRecording("u", "n", "phone", "record", {
    progress,
  });
  expect(await result.blob.text()).toBe("abcde");
  expect(result.mime).toBe("audio/ogg");
  expect(progress).toHaveBeenLastCalledWith(5, 5);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
    operation: "recording_read",
    payload: {
      sessionId: "phone",
      recordingId: "record",
      offset: 3,
      length: 262144,
    },
  });
});

it.each([
  { id: "other" },
  { offset: 1 },
  { length: 2 },
  { totalBytes: 256 * 1024 * 1024 + 1 },
  { mime: "text/html" },
  { eof: false },
])("rejects mismatched recording chunks: %j", async (extra) => {
  fetch.mockResolvedValueOnce({
    mobile_control: {
      id: "record",
      mime: "audio/ogg",
      data: "YWJj",
      offset: 0,
      length: 3,
      totalBytes: 3,
      eof: true,
      ...extra,
    },
  });
  await expect(
    readMobileRecording("u", "n", "phone", "record"),
  ).rejects.toThrow();
  expect(fetch).toHaveBeenCalledOnce();
});
