// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startFocusedPolling } from "./focused-polling";

let focused = true;
let visible = true;
let online = true;
const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  focused = true;
  visible = true;
  online = true;
  vi.spyOn(document, "hasFocus").mockImplementation(() => focused);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    visible ? "visible" : "hidden",
  );
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
});
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function event(name: string) {
  (name === "visibilitychange" ? document : window).dispatchEvent(
    new Event(name),
  );
}
function start(run = vi.fn().mockResolvedValue(undefined), nextAt = 0) {
  const cancel = vi.fn();
  cleanup.push(startFocusedPolling({ run, cancel, interval: 15_000, nextAt }));
  return { run, cancel };
}
describe("Given an analytics page", () => {
  it("stops authentication retries even after focus changes", async () => {
    const run = vi.fn().mockRejectedValue(new Error("unauthorized"));
    cleanup.push(
      startFocusedPolling({
        run,
        cancel: vi.fn(),
        interval: 15_000,
        shouldRetry: () => false,
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    focused = false;
    event("blur");
    focused = true;
    event("focus");
    await vi.advanceTimersByTimeAsync(600_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("polls only while visible, focused and online, without catch-up bursts", async () => {
    const { run, cancel } = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).toHaveBeenCalledTimes(2);
    focused = false;
    event("blur");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalled();
    focused = true;
    event("focus");
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(3);
    event("focus");
    event("visibilitychange");
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(3);
    visible = false;
    event("visibilitychange");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);
    visible = true;
    focused = false;
    event("visibilitychange");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);
    online = false;
    focused = true;
    event("focus");
    event("online");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(3);
    online = true;
    event("online");
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(4);
  });
  it("does not fetch an initially unfocused tab and preserves the freshness window", async () => {
    focused = false;
    const { run } = start(
      vi.fn().mockResolvedValue(undefined),
      Date.now() + 15_000,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).not.toHaveBeenCalled();
    focused = true;
    event("focus");
    await vi.advanceTimersByTimeAsync(9_999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("never overlaps slow requests and stops on unmount/pagehide", async () => {
    let finish!: () => void;
    const { run } = start(
      vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    event("pagehide");
    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(1);
    event("pageshow");
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    cleanup.pop()!();
    finish();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("backs off errors and cannot bypass the cooldown by toggling focus", async () => {
    const { run } = start(vi.fn().mockRejectedValue(new Error("offline")));
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    focused = false;
    event("blur");
    focused = true;
    event("focus");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
