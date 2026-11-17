import { apiFetch } from "./client";
import { ApiError } from "./errors";

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

/** Reuse the authenticated Worker/Manager API path and standard response envelope. */
export async function readModelCatalog(
  signal?: AbortSignal,
): Promise<ModelCatalog> {
  const catalog = await apiFetch<ModelCatalog>(
    "/api/v1/user/self/hosting-admin/catalog?provider=openrouter",
    { signal, cache: "no-store" },
  );
  if (
    !catalog ||
    catalog.source !== "openrouter" ||
    !Array.isArray(catalog.models) ||
    typeof catalog.fetched_at !== "string"
  ) {
    throw new ApiError("Model catalog is unavailable", 503, undefined);
  }
  return catalog;
}
