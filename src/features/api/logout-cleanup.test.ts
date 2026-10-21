import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSignOutCleanup, runSignOutCleanups } from "./logout-cleanup";
afterEach(() => vi.useRealTimers());
describe("sign out cleanup", () => {
  it("keeps ordinary logout synchronous when no receiver is mounted", () => {
    expect(runSignOutCleanups()).toBeNull();
  });
  it("waits for cleanup and isolates individual failures", async () => {
    const called = vi.fn(async () => {
      throw new Error("offline");
    });
    const unregister = registerSignOutCleanup(called);
    try {
      await runSignOutCleanups();
      expect(called).toHaveBeenCalledOnce();
    } finally {
      unregister();
    }
  });
  it("bounds cleanup so an unavailable subscription cannot block logout", async () => {
    vi.useFakeTimers();
    const unregister = registerSignOutCleanup(() => new Promise(() => {}));
    try {
      const pending = runSignOutCleanups();
      await vi.advanceTimersByTimeAsync(3000);
      await pending;
    } finally {
      unregister();
    }
  });
});
