import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, AuthError } from "./errors";
import {
  modelCatalogKey,
  readModelCatalog,
  type ModelCatalog,
} from "./model-catalog";

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
  fetcher.mockReset();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("authenticated model catalog client", () => {
  it("reads direct normalized JSON through the same-origin BFF with no provider credential headers", async () => {
    fetcher.mockResolvedValue(Response.json(fixture));
    expect(await readModelCatalog()).toEqual(fixture);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "/api/model-gateway/catalog?provider=openrouter",
      {
        credentials: "same-origin",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      },
    );
    expect(modelCatalogKey("alice")).not.toEqual(modelCatalogKey("bob"));
  });
  it.each([401, 403])(
    "treats HTTP%s as lost administrator access",
    async (status) => {
      fetcher.mockResolvedValue(new Response(null, { status }));
      await expect(readModelCatalog()).rejects.toBeInstanceOf(AuthError);
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("retains an unavailable status for explicit retry without consuming a provider error body", async () => {
    fetcher.mockResolvedValue(
      new Response("private upstream detail", { status: 503 }),
    );
    await expect(readModelCatalog()).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      message: "Model catalog is unavailable",
      body: undefined,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("accepts an empty real catalog and rejects a malformed envelope", async () => {
    fetcher
      .mockResolvedValueOnce(Response.json({ ...fixture, models: [] }))
      .mockResolvedValueOnce(Response.json({ code: 200, data: fixture }));
    expect((await readModelCatalog()).models).toEqual([]);
    await expect(readModelCatalog()).rejects.toBeInstanceOf(ApiError);
  });
  it("forwards caller cancellation to the catalog request", async () => {
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
    const controller = new AbortController();
    const reading = readModelCatalog(controller.signal);
    controller.abort(new DOMException("Caller cancelled", "AbortError"));
    await expect(reading).rejects.toMatchObject({ name: "AbortError" });
  });
  it("keeps its timeout through JSON body consumption", async () => {
    vi.useFakeTimers();
    fetcher.mockImplementation(
      async (_input, init) =>
        ({
          ok: true,
          status: 200,
          json: () =>
            new Promise((_resolve, reject) =>
              init?.signal?.addEventListener(
                "abort",
                () => reject(init.signal?.reason),
                { once: true },
              ),
            ),
        }) as Response,
    );
    const reading = readModelCatalog();
    const result = expect(reading).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(12_000);
    await result;
  });
});
