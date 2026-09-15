import { afterEach, expect, it, vi } from "vitest";
import { VNCChannel } from "./vnc-channel";
import { browserControl } from "./api";
vi.mock("./api", () => ({ browserControl: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(browserControl).mockReset();
});
it("copies input buffers and closes without replay after a failed exchange", async () => {
  vi.mocked(browserControl)
    .mockResolvedValueOnce({ id: "test", data: btoa("RFB 003.008\n") })
    .mockRejectedValueOnce(Error("lost response"))
    .mockResolvedValue({});
  const channel = new VNCChannel("u", "n");
  const bytes = new Uint8Array([1, 2]);
  channel.onopen = () => {
    channel.send(bytes);
    bytes.fill(9);
  };
  const closed = vi.fn();
  channel.onclose = closed;
  await channel.connect();
  await Promise.resolve();
  await Promise.resolve();
  const exchanges = vi
    .mocked(browserControl)
    .mock.calls.filter((c) => c[2] === "vnc_exchange");
  expect(exchanges).toHaveLength(1);
  expect(exchanges[0][3]).toMatchObject({
    seq: 0,
    data: btoa(String.fromCharCode(1, 2)),
  });
  expect(closed).toHaveBeenCalledOnce();
  expect(channel.readyState).toBe(3);
  expect(channel.failure).toContain("Error: lost response · exchange");
});

it("preserves request timing and visibility before noVNC closes on error", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(browserControl)
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue({});
  const now = vi.spyOn(Date, "now").mockReturnValue(1000);
  const channel = new VNCChannel("u", "n");
  channel.onerror = () => channel.close();
  const pending = channel.connect();
  now.mockReturnValue(13000);
  reject(new DOMException("The operation was aborted", "AbortError"));
  await pending;
  expect(channel.failure).toContain(
    "AbortError: The operation was aborted · open · 12000 ms",
  );
  expect(channel.failure).toContain("including queue");
  expect(channel.failure).toContain("page ");
  expect(channel.readyState).toBe(3);
});

it("does not report a late request failure as the cause of a manual close", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(browserControl).mockImplementationOnce(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const channel = new VNCChannel("u", "n");
  const pending = channel.connect();
  channel.close();
  reject(Error("late response"));
  await pending;
  expect(channel.failure).toBeNull();
});

it("distinguishes invalid frame encoding from a failed request", async () => {
  vi.mocked(browserControl)
    .mockResolvedValueOnce({ id: "test", data: "%invalid%" })
    .mockResolvedValue({});
  const channel = new VNCChannel("u", "n");
  await channel.connect();
  expect(channel.failure).toContain("· decode ·");
  expect(channel.readyState).toBe(3);
});

it("closes a late opened session after the viewer has left without starting exchanges", async () => {
  let resolve!: (value: { id: string }) => void;
  vi.mocked(browserControl)
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValue({});
  const channel = new VNCChannel("u", "n");
  const pending = channel.connect();
  channel.close();
  resolve({ id: "late-session" });
  await pending;
  expect(browserControl).toHaveBeenCalledWith("u", "n", "vnc_close", {
    id: "late-session",
  });
  expect(
    vi
      .mocked(browserControl)
      .mock.calls.some((call) => call[2] === "vnc_exchange"),
  ).toBe(false);
  expect(channel.readyState).toBe(3);
});
