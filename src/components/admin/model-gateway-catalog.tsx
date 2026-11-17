"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { useI18n } from "@/features/i18n/use-i18n";
import { AuthError } from "@/features/api/errors";
import {
  formatHostingDollars,
  type HostingModelPolicy,
} from "@/features/api/hosting-admin";
import {
  modelCatalogKey,
  readModelCatalog,
  type ModelCatalogItem,
} from "@/features/api/model-catalog";

export function OpenRouterCatalog({
  userId,
  selectedId,
  existingModels,
  onSelect,
  onDenied,
}: {
  userId: string;
  selectedId: string;
  existingModels: HostingModelPolicy[];
  onSelect: (item: ModelCatalogItem) => void;
  onDenied: () => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: modelCatalogKey(userId),
    queryFn: async ({ signal }) => {
      try {
        return await readModelCatalog(signal);
      } catch (error) {
        if (error instanceof AuthError) onDenied();
        throw error;
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60_000,
  });
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey: modelCatalogKey(userId) });
      client.removeQueries({ queryKey: modelCatalogKey(userId) });
    },
    [client, userId],
  );
  const needle = search.trim().toLowerCase();
  const choices =
    query.data?.models.filter(
      (item) =>
        !existingModels.some(
          (model) =>
            model.provider === "openrouter" && model.upstream_model === item.id,
        ) &&
        (item.id.toLowerCase().includes(needle) ||
          item.name.toLowerCase().includes(needle)),
    ) ?? [];
  return (
    <div
      className="min-w-0 rounded-md border border-hairline p-3 sm:col-span-2"
      aria-label={t("OpenRouter model catalog")}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-medium text-ink">
          {t("Choose an OpenRouter model")}
        </h4>
        <Button
          type="button"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t(query.isError ? "Retry catalog" : "Refresh catalog")}
        </Button>
      </div>
      {query.isPending ? (
        <p role="status" className="text-xs text-ink-tertiary">
          {t("Loading OpenRouter models…")}
        </p>
      ) : query.isError ? (
        <p role="alert" className="text-xs text-warning">
          {t("Could not load the OpenRouter catalog. Retry to choose a model.")}
        </p>
      ) : (
        <>
          <SearchBox
            aria-label={t("Search OpenRouter models")}
            placeholder={t("Search by model name or ID")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {choices.length ? (
            <>
              <ul
                className="mt-2 max-h-64 space-y-1 overflow-y-auto"
                aria-label={t("OpenRouter models")}
              >
                {choices.slice(0, 20).map((item) => (
                  <li key={item.id}>
                    <Button
                      asChild
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-auto w-full max-w-none flex-col items-start gap-1 py-2 text-left aria-pressed:border-accent aria-pressed:bg-accent/10"
                      aria-label={t("Select {name} ({id})", {
                        name: item.name,
                        id: item.id,
                      })}
                      aria-pressed={selectedId === item.id}
                      onClick={() => onSelect(item)}
                    >
                      <button type="button">
                        <span className="break-words text-xs font-medium">
                          {item.name}
                        </span>
                        <span className="max-w-full break-all font-mono text-[11px] text-ink-tertiary">
                          {item.id}
                        </span>
                        <span className="max-w-full whitespace-normal text-[11px] text-ink-tertiary">
                          {t(
                            "Input {input} / output {output} per million tokens",
                            {
                              input: formatHostingDollars(
                                item.input_microusd_per_million,
                              ),
                              output: formatHostingDollars(
                                item.output_microusd_per_million,
                              ),
                            },
                          )}
                        </span>
                        {item.pricing_is_conservative ? (
                          <span className="text-[11px] text-warning">
                            {t(
                              "Conservative rate includes conditional token charges.",
                            )}
                          </span>
                        ) : null}
                        <span className="text-[11px] text-ink-tertiary">
                          {t("Context {context} · max output {output}", {
                            context:
                              item.context_length.toLocaleString("en-US"),
                            output:
                              item.max_output_tokens.toLocaleString("en-US"),
                          })}
                        </span>
                      </button>
                    </Button>
                  </li>
                ))}
              </ul>
              {choices.length > 20 ? (
                <p className="mt-2 text-xs text-ink-tertiary">
                  {t("Showing 20 of {count} matches. Refine your search.", {
                    count: choices.length,
                  })}
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-xs text-ink-tertiary">
              {t(
                query.data?.models.length
                  ? "No matching unconfigured models. Change your search or review existing models."
                  : "OpenRouter returned no compatible priced text models.",
              )}
            </p>
          )}
          <p className="mt-2 text-xs leading-5 text-ink-tertiary">
            {t(
              "Catalog rates are estimates rounded up for accounting. Review them before saving; selecting a model does not enable it.",
            )}
          </p>
        </>
      )}
    </div>
  );
}
