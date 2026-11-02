"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";
import type {
  WorkspaceSearchHit,
  WorkspaceSearchInput,
  WorkspaceSearchPage,
} from "./workspace-search";

export type WorkspaceSearchGroup = {
  key: string;
  title: string;
  agent_id?: string;
  session_id?: string;
  matches: WorkspaceSearchHit[];
  matches_has_more: boolean;
};

export type WorkspaceSearchGroupsPage = {
  hits: WorkspaceSearchHit[];
  groups: WorkspaceSearchGroup[];
  next_cursor?: string;
  pagination_limited?: boolean;
};

export type WorkspaceSearchGroupFilters = Omit<WorkspaceSearchInput, "cursor">;
export type WorkspaceGroupMatchesInput = WorkspaceSearchInput & {
  group_key: string;
};

// Keep raw search/MCP requests unchanged. Grouping and expansion are explicit
// modes on the same endpoint, with separately bound pagination cursors.
export async function searchWorkspaceGroups(
  userId: string,
  input: WorkspaceSearchInput,
  signal?: AbortSignal,
): Promise<WorkspaceSearchGroupsPage> {
  const page = await apiFetch<WorkspaceSearchGroupsPage>(
    userPath(userId, "/search"),
    {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        kinds: input.kinds,
        session_ids: input.session_ids,
        group_by: "session",
        cursor: input.cursor,
        limit: input.limit ?? 20,
      }),
      signal,
    },
  );
  if (!page || !Array.isArray(page.groups)) {
    throw new ApiError(
      "Grouped search is unavailable. Please try again.",
      502,
      null,
    );
  }
  return page;
}

export async function searchWorkspaceGroupMatches(
  userId: string,
  input: WorkspaceGroupMatchesInput,
  signal?: AbortSignal,
): Promise<WorkspaceSearchPage> {
  const page = await apiFetch<WorkspaceSearchPage>(
    userPath(userId, "/search"),
    {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        kinds: input.kinds,
        session_ids: input.session_ids,
        group_key: input.group_key,
        cursor: input.cursor,
        limit: input.limit ?? 20,
      }),
      signal,
    },
  );
  if (!page || !Array.isArray(page.hits)) {
    throw new ApiError(
      "Matching sources could not be loaded. Please try again.",
      502,
      null,
    );
  }
  return page;
}

function normalizedFilters(
  input: WorkspaceSearchGroupFilters,
): WorkspaceSearchGroupFilters {
  return {
    query: input.query.trim(),
    kinds: input.kinds?.length ? [...new Set(input.kinds)].sort() : undefined,
    session_ids: input.session_ids?.length
      ? [...new Set(input.session_ids)].sort()
      : undefined,
    limit: input.limit ?? 20,
  };
}

export const workspaceSearchGroupKeys = {
  groups: (userId: string, input: WorkspaceSearchGroupFilters) =>
    [
      "workspace-search",
      userId,
      "session-groups",
      normalizedFilters(input),
    ] as const,
  matches: (
    userId: string,
    input: WorkspaceSearchGroupFilters,
    groupKey?: string,
  ) =>
    [
      "workspace-search",
      userId,
      "group-matches",
      normalizedFilters(input),
      groupKey ?? null,
    ] as const,
};

function retryRequest(failureCount: number, error: Error) {
  return (
    !(
      error instanceof AuthError ||
      error.name === "AbortError" ||
      error.name === "TimeoutError" ||
      (error instanceof ApiError && error.status < 500)
    ) && failureCount < 2
  );
}

export function useWorkspaceSearchGroups(
  userId: string | undefined,
  input: WorkspaceSearchGroupFilters,
) {
  const filters = normalizedFilters(input);
  const client = useQueryClient();
  const queryKey = workspaceSearchGroupKeys.groups(
    userId ?? "pending",
    filters,
  );
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      searchWorkspaceGroups(userId!, { ...filters, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(userId && filters.query),
    staleTime: 0,
    refetchOnMount: "always",
    retry: retryRequest,
  });
  return {
    ...query,
    restart: () => client.resetQueries({ queryKey, exact: true }),
  };
}

export function useWorkspaceGroupMatches(
  userId: string | undefined,
  input: WorkspaceSearchGroupFilters,
  groupKey?: string,
  enabled = true,
) {
  const filters = normalizedFilters(input);
  const client = useQueryClient();
  const queryKey = workspaceSearchGroupKeys.matches(
    userId ?? "pending",
    filters,
    groupKey,
  );
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      searchWorkspaceGroupMatches(
        userId!,
        { ...filters, group_key: groupKey!, cursor: pageParam },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: Boolean(userId && filters.query && groupKey && enabled),
    staleTime: 0,
    refetchOnMount: "always",
    retry: retryRequest,
  });
  return {
    ...query,
    restart: () => client.resetQueries({ queryKey, exact: true }),
  };
}
