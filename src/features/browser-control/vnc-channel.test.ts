import { afterEach, expect, it, vi } from "vitest";
import { VNCChannel } from "./vnc-channel";
import { browserControl } from "./api";
vi.mock("./api", () => ({ browserControl: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(browserControl).mockReset();
});

it("sends UTF-8 text once through the current control session and sequence fence", async () => {
  vi.mocked(browserControl).mockResolvedValue({});
  vi.mocked(browserControl).mockResolvedValueOnce({ id: "control" });
  const channel = new VNCChannel("u", "n");
  await channel.connect();
  // connect already allocated sequence 0 to its first framebuffer exchange.
  vi.mocked(browserControl).mockResolvedValueOnce({ ok: true });
  await channel.sendText("aA!中文\n");
  expect(browserControl).toHaveBeenCalledWith("u", "n", "view", {
    source: "docker",
    action: { type: "text", vncID: "control", seq: 1, text: "aA!中文\n" },
  });
  channel.close();
});

it("retires the connection after ambiguous text delivery instead of replaying it", async () => {
  vi.mocked(browserControl).mockResolvedValue({});
  vi.mocked(browserControl).mockResolvedValueOnce({ id: "text-failure" });
  const channel = new VNCChannel("u", "n");
  await channel.connect();
  vi.mocked(browserControl).mockRejectedValueOnce(Error("network failure"));
  await expect(channel.sendText("private text")).rejects.toThrow(
    "inspect the remote field",
  );
  expect(channel.readyState).toBe(3);
  await expect(channel.sendText("private text")).rejects.toThrow(
    "disconnected",
  );
  expect(
    vi.mocked(browserControl).mock.calls.filter((call) => call[2] === "view"),
  ).toHaveLength(1);
});

it("delivers queued pointer input before dispatching a paste", async () => {
  let acknowledge!: (value: object) => void;
  vi.mocked(browserControl).mockResolvedValue({});
  vi.mocked(browserControl)
    .mockResolvedValueOnce({ id: "pointer-first" })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    )
    .mockResolvedValueOnce({ ok: true });
  const channel = new VNCChannel("u", "n");
  channel.onopen = () => channel.send(new Uint8Array([5, 1, 0, 1, 0, 1]));
  await channel.connect();
  const sending = channel.sendText("你好");
  await Promise.resolve();
  expect(
    vi.mocked(browserControl).mock.calls.filter((call) => call[2] === "view"),
  ).toHaveLength(0);
  acknowledge({});
  await sending;
  expect(
    vi.mocked(browserControl).mock.calls.filter((call) => call[2] === "view"),
  ).toHaveLength(1);
  channel.close();
});

it("keeps a sanitized upgrade reason visible after an unsupported text command", async () => {
  vi.mocked(browserControl).mockResolvedValue({});
  vi.mocked(browserControl).mockResolvedValueOnce({ id: "old-node" });
  const channel = new VNCChannel("u", "n");
  await channel.connect();
  vi.mocked(browserControl).mockRejectedValueOnce(
    Error("unsupported Docker preview action SECRET_SENTINEL"),
  );
  await expect(channel.sendText("private text")).rejects.toThrow();
  expect(channel.failure).toContain("updated paxd and browser runtime");
  expect(channel.failure).not.toContain("SECRET_SENTINEL");
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
