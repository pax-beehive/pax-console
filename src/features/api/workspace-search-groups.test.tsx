/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  searchWorkspaceGroupMatches,
  searchWorkspaceGroups,
  useWorkspaceGroupMatches,
  useWorkspaceSearchGroups,
  workspaceSearchGroupKeys,
  type WorkspaceSearchGroup,
  type WorkspaceSearchGroupFilters,
} from "./workspace-search-groups";
import type { WorkspaceSearchHit } from "./workspace-search";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const hit: WorkspaceSearchHit = {
  ref: { kind: "summary", id: "summary_1", revision: 3 },
  snippet: "Search reads only the owner's data.",
  agent_id: "agent_1",
  session_id: "session_1",
};
const group: WorkspaceSearchGroup = {
  key: "opaque:agent_1/session_1",
  title: "Canonical session name",
  agent_id: "agent_1",
  session_id: "session_1",
  matches: [hit],
  matches_has_more: true,
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function queryWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retryDelay: 0, gcTime: Infinity, staleTime: 15_000 },
    },
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

describe("session-grouped search HTTP contract", () => {
  it("requests server-side session grouping without forwarding extra identity or expansion fields", async () => {
    fetchMock.mockResolvedValue(response({ hits: [], groups: [group] }));
    const input = {
      query: "database port",
      kinds: ["summary"],
      session_ids: ["session_1"],
      cursor: "group-page+2",
      limit: 20,
      owner_user_id: "another_user",
      group_key: "wrong_group",
    } as Parameters<typeof searchWorkspaceGroups>[1];
    await expect(searchWorkspaceGroups("self", input)).resolves.toEqual({
      hits: [],
      groups: [group],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pax/api/v1/user/self/search");
    expect(init).toMatchObject({ method: "POST", credentials: "include" });
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "database port",
      kinds: ["summary"],
      session_ids: ["session_1"],
      cursor: "group-page+2",
      limit: 20,
      group_by: "session",
    });
  });

  it("requests twenty groups by default instead of grouping twenty document hits locally", async () => {
    fetchMock.mockResolvedValue(response({ hits: [], groups: [group] }));
    await searchWorkspaceGroups("self", { query: "port" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      query: "port",
      limit: 20,
      group_by: "session",
    });
  });

  it("preserves the server's bounded-pagination signal instead of treating it as the full result set", async () => {
    fetchMock.mockResolvedValue(
      response({ hits: [], groups: [group], pagination_limited: true }),
    );
    await expect(
      searchWorkspaceGroups("self", { query: "port" }),
    ).resolves.toEqual({
      hits: [],
      groups: [group],
      pagination_limited: true,
    });
  });

  it("expands the exact opaque group with the original filters and an independent raw cursor", async () => {
    fetchMock.mockResolvedValue(
      response({ hits: [hit], next_cursor: "raw-next" }),
    );
    await expect(
      searchWorkspaceGroupMatches("self", {
        query: "port",
        kinds: ["summary"],
        session_ids: ["session_1"],
        group_key: group.key,
        cursor: "raw-page+1",
        group_by: "session",
        owner_user_id: "another_user",
      } as Parameters<typeof searchWorkspaceGroupMatches>[1]),
    ).resolves.toEqual({ hits: [hit], next_cursor: "raw-next" });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      query: "port",
      kinds: ["summary"],
      session_ids: ["session_1"],
      group_key: group.key,
      cursor: "raw-page+1",
      limit: 20,
    });
  });

  it.each([null, { hits: [] }, { hits: [], groups: null }])(
    "rejects legacy or malformed grouped responses instead of presenting an empty result",
    async (data) => {
      fetchMock.mockResolvedValue(response(data));
      await expect(
        searchWorkspaceGroups("self", { query: "port" }),
      ).rejects.toMatchObject({
        name: "ApiError",
        status: 502,
      });
    },
  );

  it("rejects a non-hit expansion response", async () => {
    fetchMock.mockResolvedValue(response({ groups: [group] }));
    await expect(
      searchWorkspaceGroupMatches("self", {
        query: "port",
        group_key: group.key,
      }),
    ).rejects.toMatchObject({ name: "ApiError", status: 502 });
  });

  it("forwards caller cancellation through the ordinary request deadline", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      });
      return response({ hits: [], groups: [] });
    });
    const controller = new AbortController();
    const pending = searchWorkspaceGroups(
      "self",
      { query: "port" },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("grouped search query ownership and pagination", () => {
  it("keeps grouped and expanded streams separate and keys all owner/filter/group parameters", () => {
    const filters: WorkspaceSearchGroupFilters = {
      query: "port",
      kinds: ["message"],
    };
    const base = workspaceSearchGroupKeys.groups("a", filters);
    expect(base).not.toEqual(workspaceSearchGroupKeys.groups("b", filters));
    const changes: Partial<WorkspaceSearchGroupFilters>[] = [
      { query: "database" },
      { kinds: ["summary"] },
      { session_ids: ["another_session"] },
      { limit: 40 },
    ];
    for (const change of changes) {
      expect(base).not.toEqual(
        workspaceSearchGroupKeys.groups("a", { ...filters, ...change }),
      );
    }
    expect(base).not.toEqual(
      workspaceSearchGroupKeys.matches("a", filters, group.key),
    );
    expect(
      workspaceSearchGroupKeys.matches("a", filters, group.key),
    ).not.toEqual(
      workspaceSearchGroupKeys.matches("a", filters, "another_group"),
    );
    expect(
      workspaceSearchGroupKeys.groups("a", {
        query: " port ",
        kinds: ["summary", "message", "summary"],
      }),
    ).toEqual(
      workspaceSearchGroupKeys.groups("a", {
        query: "port",
        kinds: ["message", "summary"],
        limit: 20,
      }),
    );
  });

  it("follows the grouped cursor after an empty permission-filtered page", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({ hits: [], groups: [], next_cursor: "groups-next" }),
      )
      .mockResolvedValueOnce(response({ hits: [], groups: [group] }));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useWorkspaceSearchGroups("user_1", { query: "port" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      group_by: "session",
      cursor: "groups-next",
      limit: 20,
    });
  });

  it("does not fetch without a query, principal, or enabled expansion", () => {
    const { wrapper } = queryWrapper();
    renderHook(() => useWorkspaceSearchGroups(undefined, { query: "port" }), {
      wrapper,
    });
    renderHook(() => useWorkspaceSearchGroups("user_1", { query: "  " }), {
      wrapper,
    });
    renderHook(() => useWorkspaceGroupMatches("user_1", { query: "port" }), {
      wrapper,
    });
    renderHook(
      () =>
        useWorkspaceGroupMatches("user_1", { query: "port" }, group.key, false),
      { wrapper },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads additional group matches only when requested and follows their raw cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ hits: [hit], next_cursor: "raw-next" }))
      .mockResolvedValueOnce(response({ hits: [], next_cursor: "raw-last" }));
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useWorkspaceGroupMatches(
          "user_1",
          { query: "port", kinds: ["summary"] },
          group.key,
          enabled,
        ),
      { wrapper, initialProps: { enabled: false } },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(true);
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      query: "port",
      kinds: ["summary"],
      group_key: group.key,
      cursor: "raw-next",
      limit: 20,
    });
  });

  it("revalidates a fresh grouped cache when the search mounts", async () => {
    fetchMock.mockResolvedValue(response(null, 403));
    const { client, wrapper } = queryWrapper();
    client.setQueryData(
      workspaceSearchGroupKeys.groups("user_1", { query: "port" }),
      {
        pages: [{ hits: [], groups: [group] }],
        pageParams: [undefined],
      },
    );
    const { result } = renderHook(
      () => useWorkspaceSearchGroups("user_1", { query: "port" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ name: "AuthError" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rechecks a fresh cached group when its previously disabled expansion is enabled", async () => {
    fetchMock.mockResolvedValue(response(null, 403));
    const { client, wrapper } = queryWrapper();
    const filters = { query: "port" };
    client.setQueryData(
      workspaceSearchGroupKeys.matches("user_1", filters, group.key),
      {
        pages: [{ hits: [hit] }],
        pageParams: [undefined],
      },
    );
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useWorkspaceGroupMatches("user_1", filters, group.key, enabled),
      { wrapper, initialProps: { enabled: false } },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ name: "AuthError" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("does not retain the previous owner's visible groups when identity changes", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ hits: [], groups: [group] }))
      .mockImplementationOnce(() => new Promise(() => {}));
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ owner }) => useWorkspaceSearchGroups(owner, { query: "port" }),
      { wrapper, initialProps: { owner: "user_1" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ owner: "user_2" });
    expect(result.current.data).toBeUndefined();
  });

  it.each(["groups", "matches"] as const)(
    "restarts %s from the first page without retaining a stale cursor",
    async (kind) => {
      fetchMock.mockImplementation(async () =>
        response(
          kind === "groups"
            ? { hits: [], groups: [group], next_cursor: "old" }
            : { hits: [hit], next_cursor: "old" },
        ),
      );
      const { wrapper } = queryWrapper();
      const useSearch =
        kind === "groups"
          ? () => useWorkspaceSearchGroups("user_1", { query: "port" })
          : () =>
              useWorkspaceGroupMatches("user_1", { query: "port" }, group.key);
      const { result } = renderHook(useSearch, { wrapper });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await act(async () => {
        await result.current.restart();
      });
      expect(
        JSON.parse(String(fetchMock.mock.calls[1][1]?.body)),
      ).not.toHaveProperty("cursor");
    },
  );

  it.each([400, 401, 403, 404, 409])(
    "does not automatically retry HTTP %i",
    async (status) => {
      fetchMock.mockImplementation(async () => response(null, status));
      const { wrapper } = queryWrapper();
      const { result } = renderHook(
        () => useWorkspaceSearchGroups("user_1", { query: "port" }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each(["AbortError", "TimeoutError"])(
    "does not automatically repeat %s requests",
    async (name) => {
      fetchMock.mockRejectedValue(new DOMException("Request stopped", name));
      const { wrapper } = queryWrapper();
      const { result } = renderHook(
        () => useWorkspaceSearchGroups("user_1", { query: "port" }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("bounds retry attempts when the grouped index is temporarily unavailable", async () => {
    fetchMock.mockImplementation(async () => response(null, 503));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useWorkspaceSearchGroups("user_1", { query: "port" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["groups", "matches"] as const)(
    "cancels %s reads on unmount",
    async (kind) => {
      fetchMock.mockImplementation(() => new Promise(() => {}));
      const { wrapper } = queryWrapper();
      const useSearch =
        kind === "groups"
          ? () => useWorkspaceSearchGroups("user_1", { query: "port" })
          : () =>
              useWorkspaceGroupMatches("user_1", { query: "port" }, group.key);
      const { unmount } = renderHook(useSearch, { wrapper });
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
      const signal = fetchMock.mock.calls[0][1]?.signal;
      unmount();
      expect(signal?.aborted).toBe(true);
    },
  );
});
