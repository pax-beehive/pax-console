import { describe, expect, it, vi } from "vitest";
import { browserControl } from "./api";
import { apiFetch } from "@/features/api/client";
vi.mock("@/features/api/client", () => ({
  apiFetch: vi.fn(),
  userPath: (_u: string, p: string) => p,
}));
describe("browser operator transport", () => {
  it("serializes node operations and does not retry an ambiguous input", async () => {
    let release!: () => void;
    vi.mocked(apiFetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({ browser_control: { ok: true, workers: [] } });
        }),
    );
    vi.mocked(apiFetch).mockRejectedValueOnce(Error("connection lost"));
    const first = browserControl("u", "n", "state");
    const second = browserControl("u", "n", "view", {
      action: { type: "click" },
    });
    await Promise.resolve();
    expect(apiFetch).toHaveBeenCalledTimes(1);
    release();
    await first;
    await expect(second).rejects.toThrow("connection lost");
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
  it("surfaces daemon rejection without treating it as successful output", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      error: { message: "not allowed" },
    });
    await expect(browserControl("u", "n", "state")).rejects.toThrow(
      "not allowed",
    );
  });
});

describe("browser screenshot responses", () => {
  it("rejects empty frames and recovers on the next request", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      browser_control: { ok: true },
    });
    const payload = { session: "browser", action: { type: "screenshot" } };
    await expect(
      browserControl("user", "node", "view", payload),
    ).rejects.toThrow("no usable image");
    const frame = { frame: "", image: "aW1hZ2U=", width: 800, height: 600 };
    vi.mocked(apiFetch).mockResolvedValueOnce({ browser_control: frame });
    await expect(
      browserControl("user", "node", "view", payload),
    ).resolves.toEqual(frame);
  });
  it("surfaces the runtime error rather than treating it as a frame", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      browser_control: { error: "Browser worker is not connected" },
    });
    await expect(
      browserControl("user", "node", "view", {
        action: { type: "screenshot" },
      }),
    ).rejects.toThrow("Browser worker is not connected");
  });
});
