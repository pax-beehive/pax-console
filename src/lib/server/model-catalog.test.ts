import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function model(extra: Record<string, unknown> = {}) {
  return {
    id: "vendor/model",
    name: "模型 — Model",
    architecture: {
      input_modalities: ["text", "image"],
      output_modalities: ["text"],
    },
    context_length: 128_000,
    top_provider: { context_length: 64_000, max_completion_tokens: 16_000 },
    pricing: { prompt: "0.0000001234567", completion: "0.0000025" },
    ...extra,
  };
}

function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, init);
}

beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("exact catalog accounting prices", () => {
  it.each([
    ["0", 0],
    ["0.000001", 1_000_000],
    ["1.234567e-7", 123457],
    ["0.0000000000010000000000001", 2],
    ["1e-1000", 1],
    ["1", 1_000_000_000_000],
    ["0e1000", 0],
  ])(
    "converts %s without floating point undercharging",
    async (value, expected) => {
      const { catalogTokenPrice } = await import("./model-catalog");
      expect(catalogTokenPrice(value)).toBe(expected);
    },
  );

  it.each([
    "-1",
    "-0",
    "+1",
    "1.000000000000000001",
    "NaN",
    "Infinity",
    "",
    " 0",
    "0x10",
    "1e999999",
    0,
    null,
    undefined,
  ])("rejects unknown, negative or out-of-bound price %s", async (value) => {
    const { catalogTokenPrice } = await import("./model-catalog");
    expect(catalogTokenPrice(value)).toBeUndefined();
  });
});

describe("catalog normalization", () => {
  it("returns only bounded public text-model fields and caps output by provider context", async () => {
    const { normalizeOpenRouterCatalog } = await import("./model-catalog");
    const result = normalizeOpenRouterCatalog({
      data: [
        model({
          description: "untrusted HTML",
          links: { details: "https://never-follow.example" },
        }),
      ],
      links: { next: null },
    });
    expect(result).toEqual([
      {
        id: "vendor/model",
        name: "模型 — Model",
        context_length: 64_000,
        max_output_tokens: 8192,
        input_microusd_per_million: 123457,
        output_microusd_per_million: 2_500_000,
      },
    ]);
    expect(
      normalizeOpenRouterCatalog({
        data: [
          model({
            context_length: 1000,
            top_provider: { max_completion_tokens: 20_000 },
          }),
        ],
      })[0].max_output_tokens,
    ).toBe(1000);
    expect(
      normalizeOpenRouterCatalog({
        data: [model({ context_length: null, top_provider: null })],
      })[0].max_output_tokens,
    ).toBe(4096);
  });

  it("uses conservative token-rate maxima across cache/reasoning and conditional schedules", async () => {
    const { normalizeOpenRouterCatalog } = await import("./model-catalog");
    const result = normalizeOpenRouterCatalog({
      data: [
        model({
          pricing: {
            prompt: "0.000001",
            completion: "0.000002",
            input_cache_write: "0.00000125",
            request: "0",
            overrides: [
              {
                min_prompt_tokens: 200000,
                prompt: "0.000003",
                completion: "0.000004",
              },
              {
                utc_start: 30,
                utc_end: 1630,
                utc_days: ["monday"],
                prompt: "0.000002",
                internal_reasoning: "0.000005",
              },
            ],
          },
        }),
      ],
    });
    expect(result[0]).toMatchObject({
      input_microusd_per_million: 3_000_000,
      output_microusd_per_million: 5_000_000,
      pricing_is_conservative: true,
    });
  });

  it.each([
    { prompt: "-1", completion: "0" },
    { prompt: "0", completion: "unknown" },
    { prompt: "0", completion: "0", request: "0.00000000000001" },
    { prompt: "0", completion: "0", future_fee: "0.1" },
    { prompt: "0", completion: "0", image: "-1" },
    { prompt: "0", completion: "0", overrides: [{ request: "0.01" }] },
    { prompt: "0", completion: "0", overrides: [{ new_charge: "0.01" }] },
    { prompt: "0", completion: "0", overrides: [{ prompt: "-1" }] },
  ])(
    "excludes unsafe or unsupported pricing rather than assuming free: %j",
    async (pricing) => {
      const { normalizeOpenRouterCatalog } = await import("./model-catalog");
      expect(
        normalizeOpenRouterCatalog({ data: [model({ pricing })] }),
      ).toEqual([]);
    },
  );

  it("excludes non-text output/input, unsafe identifiers, invalid limits and duplicates", async () => {
    const { normalizeOpenRouterCatalog } = await import("./model-catalog");
    const entries = [
      model({
        architecture: {
          input_modalities: ["image"],
          output_modalities: ["text"],
        },
      }),
      model({
        architecture: {
          input_modalities: ["text"],
          output_modalities: ["text", "image"],
        },
      }),
      model({ id: "bad id" }),
      model({ id: "x".repeat(246) }),
      model({ id: "vendor//model" }),
      model({ id: "vendor/../model" }),
      model({ id: "vendor/./model" }),
      model({ name: "bad\u0000name" }),
      model({ context_length: 1.5 }),
      model({ top_provider: { max_completion_tokens: -1 } }),
      model({ name: "x".repeat(257) }),
      model(),
      model({ pricing: { prompt: "0", completion: "0" } }),
    ];
    expect(normalizeOpenRouterCatalog({ data: entries })).toEqual([]);
  });

  it("rejects malformed, oversized and partial catalogs without following pagination", async () => {
    const { normalizeOpenRouterCatalog } = await import("./model-catalog");
    for (const body of [
      { data: {} },
      { data: Array(2001).fill(model()) },
      { data: [model()], links: { next: "https://attacker.example" } },
    ])
      expect(() => normalizeOpenRouterCatalog(body)).toThrow(
        "Model catalog is unavailable.",
      );
  });
});

describe("fixed public upstream and shared cache", () => {
  it("fetches only the fixed endpoint without credentials or redirects, caches five minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T03:00:00Z"));
    const fetch = vi.fn(async () => json({ data: [model()] }));
    vi.stubGlobal("fetch", fetch);
    const { getOpenRouterCatalog } = await import("./model-catalog");
    const first = await getOpenRouterCatalog();
    expect(await getOpenRouterCatalog()).toBe(first);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/models");
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    expect(first.fetched_at).toBe("2026-11-17T03:00:00.000Z");
    vi.setSystemTime(new Date("2026-11-17T03:05:00Z"));
    await getOpenRouterCatalog();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight request across callers", async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const { getOpenRouterCatalog } = await import("./model-catalog");
    const a = getOpenRouterCatalog();
    const b = getOpenRouterCatalog();
    expect(fetch).toHaveBeenCalledOnce();
    finish(json({ data: [model()] }));
    expect(await a).toEqual(await b);
  });

  it("does not cache failures or serve expired data after a refresh failure", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("private-error", { status: 503 }))
      .mockResolvedValueOnce(json({ data: [model()] }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    const { getOpenRouterCatalog } = await import("./model-catalog");
    await expect(getOpenRouterCatalog()).rejects.toThrow(
      "Model catalog is unavailable.",
    );
    await getOpenRouterCatalog();
    vi.setSystemTime(300_001);
    await expect(getOpenRouterCatalog()).rejects.toThrow(
      "Model catalog is unavailable.",
    );
    expect((await getOpenRouterCatalog()).models).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each([301, 302, 401, 403, 500])(
    "rejects upstream status %s",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(null, {
              status,
              headers: { location: "https://attacker.example" },
            }),
        ),
      );
      const { getOpenRouterCatalog } = await import("./model-catalog");
      await expect(getOpenRouterCatalog()).rejects.toThrow(
        "Model catalog is unavailable.",
      );
    },
  );

  it("bounds declared and actual streamed bodies and cancels oversized streams", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
      },
      cancel,
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ data: [] }, { headers: { "content-length": "2097153" } }),
      )
      .mockResolvedValueOnce(
        new Response(stream, {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const { getOpenRouterCatalog } = await import("./model-catalog");
    await expect(getOpenRouterCatalog()).rejects.toThrow();
    await expect(getOpenRouterCatalog()).rejects.toThrow();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("times out both hanging fetches and bodies, clearing singleflight for retry", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    const { getOpenRouterCatalog } = await import("./model-catalog");
    const first = expect(getOpenRouterCatalog()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_001);
    await first;
    const second = expect(getOpenRouterCatalog()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_001);
    await second;
    expect(cancel).toHaveBeenCalledOnce();
    expect((await getOpenRouterCatalog()).models).toEqual([]);
  });
});
