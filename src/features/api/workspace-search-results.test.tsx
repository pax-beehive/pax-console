/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSearchGroupMigrationRequired,
  searchWorkspaceResults,
  useWorkspaceSearchResults,
  workspaceSearchResultsKey,
} from "./workspace-search-results";
import { ApiError, AuthError } from "./errors";

const migrationMessage =
  "Grouped search requires the search index migration to finish";
const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const hit = {
  ref: {
    kind: "message",
    id: "msg_1",
    content_hash: "frozen",
    canonicalization_version: "visible-text-v1",
  },
  title: "Message",
  snippet: "A source match",
  session_id: "sess_1",
};
const group = {
  key: "group_1",
  title: "Current session title",
  matches: [hit],
  matches_has_more: false,
};
function response(data: unknown, status = 200, message?: string) {
  return new Response(JSON.stringify({ code: status, data, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function request(index: number) {
  return JSON.parse(String(fetchMock.mock.calls[index][1]?.body));
}
function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("migration-only raw search fallback", () => {
  it("returns ordinary grouped results without a second request", async () => {
    fetchMock.mockResolvedValueOnce(response({ hits: [], groups: [group] }));
    await expect(
      searchWorkspaceResults("self", { query: "port" }),
    ).resolves.toMatchObject({ mode: "grouped", groups: [group] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(request(0)).toEqual({
      query: "port",
      group_by: "session",
      limit: 20,
    });
  });

  it("uses the unchanged raw API only after the exact migration readiness response", async () => {
    fetchMock
      .mockResolvedValueOnce(response(null, 503, migrationMessage))
      .mockResolvedValueOnce(
        response({ hits: [hit], next_cursor: "raw_next" }),
      );
    await expect(
      searchWorkspaceResults("self", {
        query: "port",
        kinds: ["message"],
        session_ids: ["sess_1"],
        limit: 20,
      }),
    ).resolves.toEqual({ mode: "raw", hits: [hit], next_cursor: "raw_next" });
    expect(request(1)).toEqual({
      query: "port",
      kinds: ["message"],
      session_ids: ["sess_1"],
      limit: 20,
    });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/pax/api/v1/user/self/search");
  });

  it.each([
    [503, "Grouped search request failed"],
    [503, "Grouped search is unavailable"],
    [503, `${migrationMessage}.`],
    [502, migrationMessage],
    [400, migrationMessage],
    [401, migrationMessage],
    [403, migrationMessage],
    [409, migrationMessage],
  ])(
    "does not fall back for HTTP %i with message %j",
    async (status, message) => {
      fetchMock.mockResolvedValueOnce(response(null, status, message));
      await expect(
        searchWorkspaceResults("self", { query: "port" }),
      ).rejects.toBeInstanceOf(Error);
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("keeps later pages in raw mode without retrying grouping or changing the cursor", async () => {
    fetchMock.mockResolvedValueOnce(response({ hits: [hit] }));
    await expect(
      searchWorkspaceResults(
        "self",
        { query: "port", limit: 20 },
        { mode: "raw", cursor: "raw_next" },
      ),
    ).resolves.toMatchObject({ mode: "raw", hits: [hit] });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(request(0)).toEqual({
      query: "port",
      limit: 20,
      cursor: "raw_next",
    });
  });

  it("never switches a grouped continuation into the raw cursor stream", async () => {
    fetchMock.mockResolvedValueOnce(response(null, 503, migrationMessage));
    await expect(
      searchWorkspaceResults(
        "self",
        { query: "port" },
        { mode: "grouped", cursor: "group_next" },
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(request(0)).toMatchObject({
      group_by: "session",
      cursor: "group_next",
    });
  });

  it("preserves raw service failures and rejects malformed raw data", async () => {
    fetchMock
      .mockResolvedValueOnce(response(null, 503, migrationMessage))
      .mockResolvedValueOnce(response(null, 503, "Search request failed"));
    await expect(
      searchWorkspaceResults("self", { query: "port" }),
    ).rejects.toMatchObject({ status: 503, message: "Search request failed" });
    fetchMock
      .mockResolvedValueOnce(response(null, 503, migrationMessage))
      .mockResolvedValueOnce(response({ groups: [] }));
    await expect(
      searchWorkspaceResults("self", { query: "port" }),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("does not treat cancellation or an untyped error as migration readiness", () => {
    expect(
      isSearchGroupMigrationRequired(new AuthError(migrationMessage)),
    ).toBe(false);
    expect(isSearchGroupMigrationRequired(new Error(migrationMessage))).toBe(
      false,
    );
    expect(
      isSearchGroupMigrationRequired(new DOMException("aborted", "AbortError")),
    ).toBe(false);
    expect(
      isSearchGroupMigrationRequired(new ApiError(migrationMessage, 503, null)),
    ).toBe(true);
  });
});

describe("fallback result pagination and recovery", () => {
  it("rebuilds every continuation from fresh grouped pages when a raw result chain is refetched", async () => {
    fetchMock
      .mockResolvedValueOnce(response(null, 503, migrationMessage))
      .mockResolvedValueOnce(response({ hits: [hit], next_cursor: "raw_next" }))
      .mockResolvedValueOnce(
        response({ hits: [{ ...hit, ref: { ...hit.ref, id: "msg_2" } }] }),
      )
      .mockResolvedValueOnce(
        response({ hits: [], groups: [group], next_cursor: "group_next" }),
      )
      .mockResolvedValueOnce(
        response({ hits: [], groups: [{ ...group, key: "group_2" }] }),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useWorkspaceSearchResults("user_1", { query: "port", limit: 20 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data?.pages[0].mode).toBe("raw"));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() =>
      expect(result.current.data?.pages.map((page) => page.mode)).toEqual([
        "grouped",
        "grouped",
      ]),
    );
    expect(request(3)).toEqual({
      query: "port",
      group_by: "session",
      limit: 20,
    });
    expect(request(4)).toEqual({
      query: "port",
      group_by: "session",
      limit: 20,
      cursor: "group_next",
    });
    expect(result.current.data?.pageParams).toEqual([
      undefined,
      { mode: "grouped", cursor: "group_next" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("paginates raw hits and restarts with a fresh grouped first page when grouping becomes ready", async () => {
    fetchMock
      .mockResolvedValueOnce(response(null, 503, migrationMessage))
      .mockResolvedValueOnce(response({ hits: [hit], next_cursor: "raw_next" }))
      .mockResolvedValueOnce(
        response({ hits: [{ ...hit, ref: { ...hit.ref, id: "msg_2" } }] }),
      )
      .mockResolvedValueOnce(response({ hits: [], groups: [group] }));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useWorkspaceSearchResults("user_1", { query: "port", limit: 20 }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].mode).toBe("raw");
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(request(2)).toEqual({
      query: "port",
      limit: 20,
      cursor: "raw_next",
    });
    await act(async () => {
      await result.current.restart();
    });
    await waitFor(() =>
      expect(result.current.data?.pages[0].mode).toBe("grouped"),
    );
    expect(result.current.data?.pages).toHaveLength(1);
    expect(request(3)).toEqual({
      query: "port",
      group_by: "session",
      limit: 20,
    });
  });

  it("isolates user, query, kind, and page-size result caches", () => {
    const key = workspaceSearchResultsKey("a", { query: "port", limit: 20 });
    expect(key).not.toEqual(
      workspaceSearchResultsKey("b", { query: "port", limit: 20 }),
    );
    expect(key).not.toEqual(
      workspaceSearchResultsKey("a", { query: "db", limit: 20 }),
    );
    expect(key).not.toEqual(
      workspaceSearchResultsKey("a", {
        query: "port",
        kinds: ["summary"],
        limit: 20,
      }),
    );
    expect(key).not.toEqual(
      workspaceSearchResultsKey("a", { query: "port", limit: 40 }),
    );
  });
});
