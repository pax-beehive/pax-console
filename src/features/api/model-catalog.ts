import { ApiError, AuthError } from "./errors";

export type ModelCatalogItem = {
  id: string;
  name: string;
  context_length: number;
  max_output_tokens: number;
  input_microusd_per_million: number;
  output_microusd_per_million: number;
  pricing_is_conservative?: boolean;
};

export type ModelCatalog = {
  source: "openrouter";
  fetched_at: string;
  models: ModelCatalogItem[];
};

export const modelCatalogKey = (userId: string) =>
  ["model-catalog", userId, "openrouter"] as const;

/** Direct JSON from the same-origin BFF; provider credentials never enter this client. */
export async function readModelCatalog(
  signal?: AbortSignal,
): Promise<ModelCatalog> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = globalThis.setTimeout(
    () =>
      controller.abort(
        new DOMException("Model catalog request timed out", "TimeoutError"),
      ),
    12_000,
  );
  try {
    const response = await fetch(
      "/api/model-gateway/catalog?provider=openrouter",
      {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      },
    );
    if (response.status === 401 || response.status === 403)
      throw new AuthError();
    if (!response.ok)
      throw new ApiError(
        "Model catalog is unavailable",
        response.status,
        undefined,
      );
    const catalog = (await response.json()) as ModelCatalog;
    if (
      catalog.source !== "openrouter" ||
      !Array.isArray(catalog.models) ||
      typeof catalog.fetched_at !== "string"
    ) {
      throw new ApiError("Model catalog is unavailable", 503, undefined);
    }
    return catalog;
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
