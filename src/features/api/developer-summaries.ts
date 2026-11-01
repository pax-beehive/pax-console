"use client";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";
import type { WorkspaceSummaryVersion } from "./workspace-search";

export type DeveloperSummaryItem = {
  summary_id: string;
  revision: number;
  subject_type: WorkspaceSummaryVersion["subject_type"];
  subject_id: string;
  title: string;
  body_preview: string;
  claim_count: number;
  coverage_count: number;
  summary_source_count: number;
  created_at: string;
};
export type DeveloperSummaryPage = {
  items: DeveloperSummaryItem[];
  next_cursor?: string;
};
export type DeveloperSummarySelection = { id: string; revision?: number };

const endpoint = userPath("self", "/developer/summaries");

export function listDeveloperSummaries(cursor?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<DeveloperSummaryPage>(`${endpoint}?${params}`, { signal });
}

export function getDeveloperSummary(
  selection: DeveloperSummarySelection,
  signal?: AbortSignal,
) {
  const revision = selection.revision
    ? `?${new URLSearchParams({ revision: String(selection.revision) })}`
    : "";
  return apiFetch<{ summary: WorkspaceSummaryVersion }>(
    `${endpoint}/${encodeURIComponent(selection.id)}${revision}`,
    { signal },
  );
}

export const developerSummaryKeys = {
  list: (userId: string) => ["developer-summaries", userId, "list"] as const,
  detail: (userId: string, selection?: DeveloperSummarySelection) =>
    ["developer-summaries", userId, "detail", selection ?? null] as const,
};

function retryRequest(failures: number, error: Error) {
  return (
    !(
      error instanceof AuthError ||
      error.name === "AbortError" ||
      (error instanceof ApiError && error.status < 500)
    ) && failures < 2
  );
}

export function useDeveloperSummaries(userId: string | undefined) {
  const client = useQueryClient();
  const queryKey = developerSummaryKeys.list(userId ?? "pending");
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      listDeveloperSummaries(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(userId),
    retry: retryRequest,
  });
  return {
    ...query,
    restart: () => client.resetQueries({ queryKey, exact: true }),
  };
}

export function useDeveloperSummary(
  userId: string | undefined,
  selection?: DeveloperSummarySelection,
) {
  return useQuery({
    queryKey: developerSummaryKeys.detail(userId ?? "pending", selection),
    queryFn: ({ signal }) => getDeveloperSummary(selection!, signal),
    enabled: Boolean(userId && selection?.id),
    retry: retryRequest,
  });
}
