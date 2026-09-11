import { expect, it, vi } from "vitest";
import { VNCChannel } from "./vnc-channel";
import { browserControl } from "./api";
vi.mock("./api", () => ({ browserControl: vi.fn() }));
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
});
