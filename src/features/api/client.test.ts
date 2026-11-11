/* @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "./client";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stalledFetch() {
  return vi.fn<typeof fetch>().mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        else signal?.addEventListener("abort", () => reject(signal.reason));
      }),
  );
}

it("times out requests even when a query supplies its own cancellation signal", async () => {
  vi.useFakeTimers();
  const fetch = stalledFetch();
  vi.stubGlobal("fetch", fetch);
  const caller = new AbortController();
  const pending = apiFetch("/secretary/progress", { signal: caller.signal });
  const failure = expect(pending).rejects.toMatchObject({
    name: "TimeoutError",
  });
  await vi.advanceTimersByTimeAsync(12_000);
  await failure;
  expect(caller.signal.aborted).toBe(false);
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps a cold Android boot request alive beyond the default deadline while bounding its full duration", async () => {
  vi.useFakeTimers();
  const fetch = stalledFetch();
  vi.stubGlobal("fetch", fetch);
  const pending = apiFetch(
    "/nodes/node/daemon/mobile",
    { method: "POST" },
    { timeoutMs: 720_000 },
  );
  const failure = expect(pending).rejects.toMatchObject({
    name: "TimeoutError",
  });
  await vi.advanceTimersByTimeAsync(12_000);
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(708_000);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});

it("still cancels a long-running Android request immediately when its caller closes the panel", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", stalledFetch());
  const caller = new AbortController();
  const pending = apiFetch(
    "/nodes/node/daemon/mobile",
    { signal: caller.signal },
    { timeoutMs: 720_000 },
  );
  const failure = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(500);
  caller.abort();
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});

it.each([0, -1, Infinity, 720_001])(
  "refuses unbounded or invalid request deadlines: %s",
  async (timeoutMs) => {
    const fetch = stalledFetch();
    vi.stubGlobal("fetch", fetch);
    await expect(
      apiFetch("/nodes/node/daemon/mobile", {}, { timeoutMs }),
    ).rejects.toThrow(RangeError);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("forwards caller cancellation immediately and removes its listener", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", stalledFetch());
  const caller = new AbortController();
  const remove = vi.spyOn(caller.signal, "removeEventListener");
  const pending = apiFetch("/secretary/progress", { signal: caller.signal });
  const failure = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  caller.abort();
  await failure;
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves a caller that was already cancelled", async () => {
  const fetch = stalledFetch();
  vi.stubGlobal("fetch", fetch);
  const caller = new AbortController();
  caller.abort();
  await expect(
    apiFetch("/secretary/progress", { signal: caller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
});

it("keeps the deadline active while reading a stalled JSON body", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({ "Content-Type": "application/json" }),
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new DOMException("Body aborted", "AbortError")),
              );
            }),
        }) as Response,
    ),
  );
  const pending = apiFetch("/secretary/progress");
  const failure = expect(pending).rejects.toMatchObject({
    name: "TimeoutError",
  });
  await vi.advanceTimersByTimeAsync(12_000);
  await failure;
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up the deadline and caller listener after successful JSON parsing", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ code: 200, data: { ok: true } })),
  );
  const caller = new AbortController();
  const remove = vi.spyOn(caller.signal, "removeEventListener");
  await expect(
    apiFetch("/secretary/progress", { signal: caller.signal }),
  ).resolves.toEqual({ ok: true });
  expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});
it.each([
  [
    404,
    { error: "not_found" },
    "Requested API endpoint was not found (HTTP 404).",
  ],
  [
    503,
    { error: "region_unavailable" },
    "Your region is temporarily unavailable. Retry shortly (HTTP 503).",
  ],
  [500, { error: "private diagnostic" }, "PAX API request failed (HTTP 500)."],
  [400, { code: 400, message: "Invalid version" }, "Invalid version"],
])(
  "handles HTTP %s errors from both Worker and Manager envelopes",
  async (status, body, message) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json(body, { status: status as number })),
    );
    await expect(apiFetch("/api/v1/public/artifacts/download")).rejects.toThrow(
      message as string,
    );
  },
);
