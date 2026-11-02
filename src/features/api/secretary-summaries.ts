"use client";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";
import {
  isWorkspaceSummaryVersion,
  readWorkspaceSource,
  type WorkspaceSummaryVersion,
} from "./workspace-search";

export type SecretarySummaryItem = {
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

export type SecretarySummaryPage = {
  items: SecretarySummaryItem[];
  next_cursor?: string;
};

export type SecretarySummarySelection = { id: string; revision?: number };

export function getSecretarySummaries(
  userId: string,
  cursor?: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return apiFetch<SecretarySummaryPage>(
    userPath(userId, `/secretary/summaries?${params}`),
    { signal },
  );
}

export async function getSecretarySummary(
  userId: string,
  selection: SecretarySummarySelection,
  signal?: AbortSignal,
): Promise<WorkspaceSummaryVersion> {
  const source = await readWorkspaceSource(
    userId,
    {
      ref: { kind: "summary", id: selection.id, revision: selection.revision },
    },
    signal,
  );
  if (
    !source ||
    !isWorkspaceSummaryVersion(source) ||
    source.summary_id !== selection.id ||
    (selection.revision !== undefined && source.revision !== selection.revision)
  ) {
    throw new ApiError(
      "The requested summary version could not be loaded",
      502,
      null,
    );
  }
  return source;
}

export const secretarySummaryKeys = {
  list: (userId: string) => ["secretary-summaries", userId, "list"] as const,
  detail: (userId: string, selection?: SecretarySummarySelection) =>
    [
      "secretary-summaries",
      userId,
      "detail",
      selection ? { id: selection.id, revision: selection.revision } : null,
    ] as const,
};

function retryRequest(failures: number, error: Error) {
  return (
    !(
      error instanceof AuthError ||
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      (error instanceof ApiError && error.status < 500)
    ) && failures < 2
  );
}

export function useSecretarySummaries(userId: string | undefined) {
  const client = useQueryClient();
  const queryKey = secretarySummaryKeys.list(userId ?? "pending");
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      getSecretarySummaries(userId!, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(userId),
    refetchOnMount: "always",
    retry: retryRequest,
  });
  return {
    ...query,
    restart: () => client.resetQueries({ queryKey, exact: true }),
  };
}

export function useSecretarySummary(
  userId: string | undefined,
  selection?: SecretarySummarySelection,
) {
  return useQuery({
    queryKey: secretarySummaryKeys.detail(userId ?? "pending", selection),
    queryFn: ({ signal }) => getSecretarySummary(userId!, selection!, signal),
    enabled: Boolean(userId && selection?.id),
    refetchOnMount: "always",
    retry: retryRequest,
  });
}
