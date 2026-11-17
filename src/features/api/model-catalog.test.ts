/* @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelCatalog } from "./model-catalog";

const fixture: ModelCatalog = {
  source: "openrouter",
  fetched_at: "2026-11-16T00:00:00Z",
  models: [
    {
      id: "vendor/model",
      name: "Model",
      context_length: 100000,
      max_output_tokens: 8192,
      input_microusd_per_million: 1234567,
      output_microusd_per_million: 7654321,
      pricing_is_conservative: true,
    },
  ],
};
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_PAX_API_BASE_URL", "/api/pax");
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function client() {
  return import("./model-catalog");
}

describe("model catalog on the authenticated Manager API path", () => {
  it.each(["/api/pax", "/configured-pax-api"])(
    "uses apiFetch credentials and the configured %s base, unwrapping Manager's JSON envelope",
    async (base) => {
      vi.stubEnv("NEXT_PUBLIC_PAX_API_BASE_URL", base);
      fetcher.mockResolvedValue(Response.json({ code: 200, data: fixture }));
      const { readModelCatalog, modelCatalogKey } = await client();
      expect(await readModelCatalog()).toEqual(fixture);
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        `${base}/api/v1/user/self/hosting-admin/catalog?provider=openrouter`,
        {
          credentials: "include",
          redirect: "manual",
          cache: "no-store",
          method: "GET",
          headers: expect.any(Headers),
          signal: expect.any(AbortSignal),
        },
      );
      expect([...new Headers(fetcher.mock.calls[0][1]?.headers)]).toEqual([]);
      expect(modelCatalogKey("alice")).not.toEqual(modelCatalogKey("bob"));
    },
  );
  it.each([401, 403])(
    "preserves apiFetch authentication failure for HTTP%s",
    async (status) => {
      fetcher.mockResolvedValue(
        Response.json({ code: status, message: "Forbidden" }, { status }),
      );
      await expect((await client()).readModelCatalog()).rejects.toMatchObject({
        name: "AuthError",
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("surfaces Manager503 for explicit retry without an automatic request replay", async () => {
    fetcher.mockResolvedValue(
      Response.json(
        { code: 503, message: "Catalog temporarily unavailable" },
        { status: 503 },
      ),
    );
    await expect((await client()).readModelCatalog()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("accepts an empty real catalog but rejects the obsolete unwrapped response and malformed DTO", async () => {
    fetcher
      .mockResolvedValueOnce(
        Response.json({ code: 200, data: { ...fixture, models: [] } }),
      )
      .mockResolvedValueOnce(Response.json(fixture))
      .mockResolvedValueOnce(
        Response.json({ code: 200, data: { ...fixture, models: null } }),
      );
    const { readModelCatalog } = await client();
    expect((await readModelCatalog()).models).toEqual([]);
    await expect(readModelCatalog()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
    });
    await expect(readModelCatalog()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
    });
  });
  it("inherits apiFetch caller cancellation", async () => {
    fetcher.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) =>
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          ),
        ),
    );
    const { readModelCatalog } = await client();
    const controller = new AbortController();
    const reading = readModelCatalog(controller.signal);
    controller.abort(new DOMException("Caller cancelled", "AbortError"));
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  });
  it("inherits the apiFetch deadline through JSON envelope body consumption", async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation(
      async (_input, init) =>
        ({
          ok: true,
          status: 200,
          headers: new Headers({ "Content-Type": "application/json" }),
          json: () =>
            new Promise((_resolve, reject) =>
              init?.signal?.addEventListener(
                "abort",
                () => reject(new DOMException("Body aborted", "AbortError")),
                { once: true },
              ),
            ),
        }) as Response,
    );
    const { readModelCatalog } = await client();
    const reading = readModelCatalog();
    const failed = expect(reading).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(12_000);
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });
});
