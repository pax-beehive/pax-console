/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
});

describe("Secretary retry request identity", () => {
  it("restores an unacknowledged request after reload and keeps owners separate", async () => {
    const initial = (await import("./secretary-retry-requests"))
      .secretaryRetryRequests;
    const first = initial.getState().acquire("owner-a");
    vi.resetModules();
    const restored = (await import("./secretary-retry-requests"))
      .secretaryRetryRequests;
    expect(restored.getState().acquire("owner-a")).toBe(first);
    expect(restored.getState().acquire("owner-b")).not.toBe(first);
    restored.getState().acknowledge("owner-b", first);
    expect(restored.getState().acquire("owner-a")).toBe(first);
  });
  it("clears only the matching acknowledgement and never deletes a newer request", async () => {
    const store = (await import("./secretary-retry-requests"))
      .secretaryRetryRequests;
    const first = store.getState().acquire("owner");
    store.getState().acknowledge("owner", first);
    const second = store.getState().acquire("owner");
    expect(second).not.toBe(first);
    store.getState().acknowledge("owner", first);
    expect(store.getState().acquire("owner")).toBe(second);
    store.getState().acknowledge("owner", second);
    vi.resetModules();
    const reloaded = (await import("./secretary-retry-requests"))
      .secretaryRetryRequests;
    expect(reloaded.getState().acquire("owner")).not.toBe(second);
  });
  it("keeps the in-memory request stable and acknowledges successfully when browser storage rejects writes", async () => {
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Storage unavailable", "QuotaExceededError");
      });
    try {
      const store = (await import("./secretary-retry-requests"))
        .secretaryRetryRequests;
      const id = store.getState().acquire("owner");
      expect(store.getState().acquire("owner")).toBe(id);
      expect(() => store.getState().acknowledge("owner", id)).not.toThrow();
      expect(store.getState().acquire("owner")).not.toBe(id);
    } finally {
      write.mockRestore();
    }
  });
});
