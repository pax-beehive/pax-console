import type { NextRequest } from "next/server";

import type {
  ModelCatalog,
  ModelCatalogItem,
} from "@/features/api/model-catalog";

const CATALOG_URL = "https://openrouter.ai/api/v1/models";
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
const MAX_AUTH_BYTES = 256 * 1024;
const MAX_MODELS = 2000;
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const MAX_PRICE = BigInt(1_000_000_000_000);
const TOKEN_PRICES = new Set([
  "prompt",
  "completion",
  "input_cache_read",
  "input_cache_write",
  "input_cache_write_1h",
  "internal_reasoning",
]);
const OTHER_PRICES = new Set([
  "request",
  "image",
  "image_output",
  "audio",
  "audio_output",
  "input_audio_cache",
  "web_search",
]);
const CONDITIONS = new Set([
  "min_prompt_tokens",
  "utc_start",
  "utc_end",
  "utc_days",
]);

let cached: { catalog: ModelCatalog; expiresAt: number } | undefined;
let loading: Promise<ModelCatalog> | undefined;

export class ModelCatalogError extends Error {
  constructor(public readonly status: 401 | 403 | 503 = 503) {
    super("Model catalog is unavailable.");
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// OpenRouter publishes decimal USD/token strings. Keep every decimal digit until
// rounding up to integer microusd per million tokens (USD/token * 10^12).
export function catalogTokenPrice(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length > 96) return undefined;
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) return undefined;
  const exponent = Number(match[3] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000)
    return undefined;
  const digits = BigInt(match[1] + (match[2] ?? ""));
  const scale = 12 + exponent - (match[2]?.length ?? 0);
  let price: bigint;
  if (scale >= 0) {
    price = digits * BigInt(10) ** BigInt(scale);
  } else {
    const divisor = BigInt(10) ** BigInt(-scale);
    price = (digits + divisor - BigInt(1)) / divisor;
  }
  return price <= MAX_PRICE ? Number(price) : undefined;
}

function integer(value: unknown, maximum = 1_000_000_000): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= maximum
  );
}

function prices(pricing: unknown) {
  if (!record(pricing)) return undefined;
  const prompt = catalogTokenPrice(pricing.prompt);
  const completion = catalogTokenPrice(pricing.completion);
  if (prompt === undefined || completion === undefined) return undefined;
  let input = prompt;
  let output = completion;
  const variants = pricing.overrides ?? [];
  if (!Array.isArray(variants) || variants.length > 100) return undefined;
  for (const [index, rates] of [pricing, ...variants].entries()) {
    if (!record(rates)) return undefined;
    for (const [key, value] of Object.entries(rates)) {
      if (index === 0 && key === "overrides") continue;
      // Max all conditional rates instead of choosing a time/context window.
      // Unknown conditions/charges fail closed until their grammar is reviewed.
      if (index > 0 && CONDITIONS.has(key)) continue;
      if (!TOKEN_PRICES.has(key) && !OTHER_PRICES.has(key)) return undefined;
      const amount = catalogTokenPrice(value);
      if (amount === undefined || (key === "request" && amount > 0))
        return undefined;
      if (key === "prompt" || key.startsWith("input_cache_"))
        input = Math.max(input, amount);
      if (key === "completion" || key === "internal_reasoning")
        output = Math.max(output, amount);
    }
  }
  return {
    input_microusd_per_million: input,
    output_microusd_per_million: output,
    ...(input > prompt || output > completion
      ? { pricing_is_conservative: true }
      : {}),
  };
}

function normalizeModel(value: unknown): ModelCatalogItem | undefined {
  if (!record(value)) return undefined;
  const { id, name, architecture, top_provider: top } = value;
  if (
    typeof id !== "string" ||
    // Manager routes through "openrouter/" and caps the full route at 256.
    id.length > 245 ||
    !/^[A-Za-z0-9~][A-Za-z0-9._:/@+~=-]*$/.test(id) ||
    id.split("/").some((part) => !part || part === "." || part === "..") ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 256 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    !record(architecture) ||
    !Array.isArray(architecture.input_modalities) ||
    !architecture.input_modalities.includes("text") ||
    !Array.isArray(architecture.output_modalities) ||
    architecture.output_modalities.length !== 1 ||
    architecture.output_modalities[0] !== "text"
  )
    return undefined;
  const rates = prices(value.pricing);
  if (!rates) return undefined;
  if (value.context_length != null && !integer(value.context_length))
    return undefined;
  if (top != null && !record(top)) return undefined;
  const provider = record(top) ? top : {};
  for (const key of ["max_completion_tokens", "context_length"])
    if (provider[key] != null && !integer(provider[key])) return undefined;
  const contexts = [value.context_length, provider.context_length].filter(
    (limit): limit is number => integer(limit),
  );
  const contextLength = contexts.length ? Math.min(...contexts) : 0;
  const outputLimit = integer(provider.max_completion_tokens)
    ? provider.max_completion_tokens
    : contextLength || 4096;
  return {
    id,
    name: name.trim(),
    context_length: contextLength,
    max_output_tokens: Math.min(8192, outputLimit, contextLength || 8192),
    ...rates,
  };
}

export function normalizeOpenRouterCatalog(value: unknown): ModelCatalogItem[] {
  if (
    !record(value) ||
    !Array.isArray(value.data) ||
    value.data.length > MAX_MODELS
  )
    throw new ModelCatalogError();
  // Never follow provider-supplied pagination URLs or return a partial catalog.
  if (value.links != null && (!record(value.links) || value.links.next != null))
    throw new ModelCatalogError();
  const models = new Map<string, ModelCatalogItem>();
  const duplicates = new Set<string>();
  for (const entry of value.data) {
    const model = normalizeModel(entry);
    if (!model) continue;
    if (models.has(model.id)) duplicates.add(model.id);
    models.set(model.id, model);
  }
  return [...models.values()]
    .filter((model) => !duplicates.has(model.id))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
}

async function deadline<T>(work: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ModelCatalogError());
    }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function boundedJson(
  response: Response,
  maximum: number,
  signal: AbortSignal,
) {
  const length = response.headers.get("content-length");
  if (
    (length !== null &&
      (!/^\d+$/.test(length) || BigInt(length) > BigInt(maximum))) ||
    response.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json" ||
    !response.body
  ) {
    await response.body?.cancel().catch(() => {});
    throw new ModelCatalogError();
  }
  const reader = response.body.getReader();
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (signal.aborted) throw new ModelCatalogError();
      if (done) break;
      total += value.byteLength;
      if (total > maximum) {
        await reader.cancel().catch(() => {});
        throw new ModelCatalogError();
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}

export async function requireCatalogAdmin(request: NextRequest) {
  const cookie =
    process.env.PAX_CF_AUTHORIZATION ??
    request.cookies.get("CF_Authorization")?.value;
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion") || cookie;
  if (!assertion) throw new ModelCatalogError(401);
  const target = new URL(
    "/api/v1/user/self/hosting-admin?limit=1",
    process.env.PAX_MANAGER_URL ?? "https://api.paxworkspace.net",
  );
  const headers = new Headers({
    Accept: "application/json",
    "Cf-Access-Jwt-Assertion": assertion,
  });
  if (cookie) headers.set("cookie", `CF_Authorization=${cookie}`);
  await deadline(async (signal) => {
    const response = await fetch(target, {
      method: "GET",
      headers,
      redirect: "error",
      cache: "no-store",
      signal,
    });
    if (response.status === 401 || response.status === 403) {
      void response.body?.cancel().catch(() => {});
      throw new ModelCatalogError(response.status);
    }
    if (response.status !== 200 || response.redirected) {
      void response.body?.cancel().catch(() => {});
      throw new ModelCatalogError();
    }
    const body = await boundedJson(response, MAX_AUTH_BYTES, signal);
    if (
      !record(body) ||
      body.code !== 200 ||
      !record(body.data) ||
      !Number.isSafeInteger(body.data.revision) ||
      typeof body.data.enabled !== "boolean" ||
      !record(body.data.pool)
    )
      throw new ModelCatalogError();
  });
}

export async function getOpenRouterCatalog(): Promise<ModelCatalog> {
  if (cached && Date.now() < cached.expiresAt) return cached.catalog;
  if (loading) return loading;
  loading = deadline(async (signal) => {
    const response = await fetch(CATALOG_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
      signal,
    });
    if (response.status !== 200 || response.redirected) {
      void response.body?.cancel().catch(() => {});
      throw new ModelCatalogError();
    }
    const models = normalizeOpenRouterCatalog(
      await boundedJson(response, MAX_CATALOG_BYTES, signal),
    );
    const fetched = Date.now();
    const catalog: ModelCatalog = {
      source: "openrouter",
      fetched_at: new Date(fetched).toISOString(),
      models,
    };
    cached = { catalog, expiresAt: fetched + CACHE_MS };
    return catalog;
  });
  try {
    return await loading;
  } finally {
    loading = undefined;
  }
}

export function readAdminModelCatalog(request: NextRequest) {
  // Bound the complete BFF request as well as each individual network/body read.
  // Public singleflight work may finish for other authorized callers after this
  // caller's deadline; it never contains or forwards caller credentials.
  return deadline(async () => {
    await requireCatalogAdmin(request);
    return getOpenRouterCatalog();
  });
}
