"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";

export type SecretaryCoverageCounts = {
  total_messages: number;
  completed_messages: number;
  pending_messages: number;
  total_turns: number;
  completed_turns: number;
  pending_turns: number;
  ungrouped_messages: number;
};
export type SecretaryProgressCounts = SecretaryCoverageCounts & {
  total_sessions: number;
  completed_sessions: number;
  partial_sessions: number;
  unstarted_sessions: number;
};
export type SecretarySessionProgress = SecretaryCoverageCounts & {
  source_id: string;
  agent_id: string;
  session_id: string;
  title: string;
  state: "completed" | "partial" | "unstarted";
  last_completed_at?: string;
};
export type SecretaryProgressPage = {
  as_of: string;
  counts: SecretaryProgressCounts;
  sessions: SecretarySessionProgress[];
  next_cursor?: string;
};
export const secretaryProgressKeys = {
  progress: (userId: string) => ["secretary", userId, "progress"] as const,
};

export function getSecretaryProgress(
  userId: string,
  input: { cursor?: string; limit?: number } = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: String(input.limit ?? 20) });
  if (input.cursor) params.set("cursor", input.cursor);
  return apiFetch<SecretaryProgressPage>(
    userPath(userId, `/secretary/progress?${params}`),
    { signal },
  );
}

export function useSecretaryProgress(userId: string | undefined) {
  const client = useQueryClient();
  const queryKey = secretaryProgressKeys.progress(userId ?? "pending");
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      getSecretaryProgress(
        userId as string,
        { cursor: pageParam, limit: 20 },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(userId),
    refetchInterval: 30000,
    retry: (count, error) =>
      !(
        error instanceof AuthError ||
        error.name === "AbortError" ||
        (error instanceof ApiError && error.status < 500)
      ) && count < 2,
  });
  // Refetch replaces loaded pages. Explicit refresh discards pagination so a
  // changed session universe cannot retain an expired cursor or stale rows.
  return {
    ...query,
    restart: () => client.resetQueries({ queryKey, exact: true }),
  };
}
