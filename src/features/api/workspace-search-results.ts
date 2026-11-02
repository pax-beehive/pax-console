"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, AuthError } from "./errors";
import {
  searchWorkspace,
  type WorkspaceSearchInput,
  type WorkspaceSearchPage,
} from "./workspace-search";
import {
  searchWorkspaceGroups,
  workspaceSearchGroupKeys,
  type WorkspaceSearchGroupFilters,
  type WorkspaceSearchGroupsPage,
} from "./workspace-search-groups";

export type WorkspaceSearchResultsPage =
  | (WorkspaceSearchGroupsPage & { mode: "grouped" })
  | (WorkspaceSearchPage & { mode: "raw" });

type SearchPageParam = {
  mode: WorkspaceSearchResultsPage["mode"];
  cursor: string;
};

async function rawResults(
  userId: string,
  input: WorkspaceSearchInput,
  signal?: AbortSignal,
): Promise<WorkspaceSearchResultsPage> {
  const page = await searchWorkspace(userId, input, signal);
  if (!page || !Array.isArray(page.hits)) {
    throw new ApiError(
      "Search results could not be loaded. Please try again.",
      502,
      null,
    );
  }
  return { ...page, mode: "raw" };
}

export function isSearchGroupMigrationRequired(error: unknown) {
  return (
    error instanceof ApiError &&
    error.status === 503 &&
    error.message ===
      "Grouped search requires the search index migration to finish"
  );
}

export async function searchWorkspaceResults(
  userId: string,
  input: WorkspaceSearchInput,
  page?: SearchPageParam,
  signal?: AbortSignal,
): Promise<WorkspaceSearchResultsPage> {
  if (page?.mode === "raw") {
    return rawResults(userId, { ...input, cursor: page.cursor }, signal);
  }
  try {
    return {
      ...(await searchWorkspaceGroups(
        userId,
        { ...input, cursor: page?.cursor },
        signal,
      )),
      mode: "grouped",
    };
  } catch (error) {
    // A grouped cursor cannot be used in the raw result stream. Only the first
    // page may switch modes, and only for Manager's exact readiness response.
    if (page || !isSearchGroupMigrationRequired(error)) throw error;
    return rawResults(userId, { ...input, cursor: undefined }, signal);
  }
}

export const workspaceSearchResultsKey = (
  userId: string,
  input: WorkspaceSearchGroupFilters,
) =>
  [
    ...workspaceSearchGroupKeys.groups(userId, input),
    "migration-fallback",
  ] as const;

export function useWorkspaceSearchResults(
  userId: string | undefined,
  input: WorkspaceSearchGroupFilters,
) {
  const queryClient = useQueryClient();
  const queryKey = workspaceSearchResultsKey(userId ?? "pending", input);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      searchWorkspaceResults(userId!, input, pageParam, signal),
    initialPageParam: undefined as SearchPageParam | undefined,
    getNextPageParam: (page): SearchPageParam | undefined =>
      page.next_cursor
        ? { mode: page.mode, cursor: page.next_cursor }
        : undefined,
    enabled: Boolean(userId && input.query.trim()),
    staleTime: 0,
    refetchOnMount: "always",
    retry: (failureCount, error) =>
      !(error instanceof AuthError) &&
      !isSearchGroupMigrationRequired(error) &&
      error.name !== "AbortError" &&
      error.name !== "TimeoutError" &&
      !(error instanceof ApiError && error.status < 500) &&
      failureCount < 2,
  });
  return {
    ...query,
    restart: () => queryClient.resetQueries({ queryKey, exact: true }),
  };
}
