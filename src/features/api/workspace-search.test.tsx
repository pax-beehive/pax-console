/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, AuthError } from "./errors";
import {
  isWorkspaceMessageRead,
  isWorkspaceSummaryVersion,
  readWorkspaceSource,
  searchWorkspace,
  useWorkspaceSearch,
  useWorkspaceSource,
  workspaceSearchKeys,
  type WorkspaceMessageRead,
  type WorkspaceSearchInput,
  type WorkspaceSearchPage,
  type WorkspaceSummaryVersion,
} from "./workspace-search";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];

const message: WorkspaceMessageRead = {
  ref: {
    kind: "message",
    id: "msg_1",
    content_hash: "sha256:body",
    canonicalization_version: "visible-text-v1",
  },
  message_id: "msg_1",
  agent_id: "agent_1",
  session_id: "sess_1",
  role: "assistant",
  session_seq: 12,
  created_at: "2026-10-31T12:00:00Z",
  text: "数据库",
  view: "last",
  available_views: ["first", "last", "full"],
  has_more: false,
  read_receipt: "signed-receipt",
};

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      code: status,
      data,
      message: status >= 400 ? "failed" : undefined,
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
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

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("workspace search HTTP contract", () => {
  it("posts supported fields through the same-origin API and unwraps the response", async () => {
    const page: WorkspaceSearchPage = {
      hits: [{ ref: message.ref, snippet: "数据库", session_id: "sess_1" }],
      next_cursor: "cursor-2",
    };
    fetchMock.mockResolvedValue(response(page));
    const controller = new AbortController();
    const input = {
      query: "数据",
      kinds: ["message"],
      session_ids: ["sess_1"],
      cursor: "cursor-1",
      limit: 10,
      owner_user_id: "someone-else",
    } as WorkspaceSearchInput;

    await expect(
      searchWorkspace("self", input, controller.signal),
    ).resolves.toEqual(page);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pax/api/v1/user/self/search");
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      signal: controller.signal,
    });
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "数据",
      kinds: ["message"],
      session_ids: ["sess_1"],
      cursor: "cursor-1",
      limit: 10,
    });
  });

  it("sends exact version, view, pagination, and bounded context fields for source reads", async () => {
    fetchMock.mockResolvedValue(response(message));
    const controller = new AbortController();
    const request = {
      ref: message.ref,
      view: "full" as const,
      offset: 4,
      limit: 200,
      before: 2,
      after: 3,
    };

    await expect(
      readWorkspaceSource("usr_1", request, controller.signal),
    ).resolves.toEqual(message);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pax/api/v1/user/usr_1/search/read");
    expect(init?.signal).toBe(controller.signal);
    expect(JSON.parse(String(init?.body))).toEqual(request);
  });

  it.each([401, 403])(
    "propagates authentication failure %i",
    async (status) => {
      fetchMock.mockResolvedValue(response(null, status));
      await expect(
        searchWorkspace("self", { query: "数据" }),
      ).rejects.toBeInstanceOf(AuthError);
    },
  );

  it.each([400, 404, 409, 503])(
    "preserves API failure %i for meaningful UI states",
    async (status) => {
      fetchMock.mockResolvedValue(response(null, status));
      await expect(
        readWorkspaceSource("self", { ref: message.ref }),
      ).rejects.toMatchObject({ name: "ApiError", status });
    },
  );

  it("propagates cancellation without changing the caller signal", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      await new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
      return response({ hits: [] });
    });
    const controller = new AbortController();
    const pending = searchWorkspace(
      "self",
      { query: "数据" },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

describe("workspace search queries", () => {
  it("uses the server continuation even for an empty filtered page", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ hits: [], next_cursor: "next" }))
      .mockResolvedValueOnce(
        response({ hits: [{ ref: message.ref, snippet: "数据库" }] }),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useWorkspaceSearch("usr_1", { query: "数据" }),
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
      query: "数据",
      cursor: "next",
    });
  });

  it("does not run for empty queries or a missing authenticated owner", async () => {
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ owner, query }: { owner?: string; query: string }) =>
        useWorkspaceSearch(owner, { query }),
      {
        wrapper,
        initialProps: { owner: "usr_1" as string | undefined, query: "  " },
      },
    );
    expect(result.current.fetchStatus).toBe("idle");
    rerender({ owner: undefined, query: "数据" });
    expect(result.current.fetchStatus).toBe("idle");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("restarts an expired cursor chain from the first page", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ hits: [], next_cursor: "expired" }))
      .mockResolvedValueOnce(response(null, 400))
      .mockResolvedValueOnce(
        response({ hits: [{ ref: message.ref, snippet: "fresh" }] }),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useWorkspaceSearch("usr_1", { query: "数据" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
    await act(async () => {
      await result.current.restart();
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0].hits[0].snippet).toBe("fresh");
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toEqual({
      query: "数据",
    });
  });

  it("isolates cached pages by owner and filters and clears visible data when owner changes", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ hits: [{ ref: message.ref, snippet: "private" }] }),
    );
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ owner }) =>
        useWorkspaceSearch(owner, { query: "数据", kinds: ["message"] }),
      { wrapper, initialProps: { owner: "usr_1" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ owner: "usr_2" });
    expect(result.current.data).toBeUndefined();
    expect(workspaceSearchKeys.search("usr_1", { query: "数据" })).not.toEqual(
      workspaceSearchKeys.search("usr_2", { query: "数据" }),
    );
    expect(
      workspaceSearchKeys.search("usr_1", {
        query: "数据",
        kinds: ["message"],
      }),
    ).not.toEqual(
      workspaceSearchKeys.search("usr_1", {
        query: "数据",
        kinds: ["summary"],
      }),
    );
  });

  it("aborts an in-flight search on unmount", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { wrapper } = queryWrapper();
    const { unmount } = renderHook(
      () => useWorkspaceSearch("usr_1", { query: "数据" }),
      { wrapper },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it.each([400, 401, 403, 404, 409])(
    "does not retry terminal HTTP %i",
    async (status) => {
      fetchMock.mockImplementation(async () => response(null, status));
      const { wrapper } = queryWrapper();
      const { result } = renderHook(
        () => useWorkspaceSearch("usr_1", { query: "数据" }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("retries transient service unavailability with a finite limit", async () => {
    fetchMock.mockImplementation(async () => response(null, 503));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(
      () => useWorkspaceSearch("usr_1", { query: "数据" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.error).toBeInstanceOf(ApiError));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("source reads and types", () => {
  it("enables reads only when a reference exists and caches every read parameter", async () => {
    fetchMock.mockImplementation(async () => response(message));
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useWorkspaceSource(
          "usr_1",
          enabled ? { ref: message.ref, view: "full", before: 2 } : undefined,
        ),
      { wrapper, initialProps: { enabled: false } },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toEqual(message));
    const base = { ref: message.ref, view: "full" as const };
    const key = workspaceSearchKeys.source("usr_1", base);
    for (const change of [
      { view: "last" as const },
      { offset: 2 },
      { limit: 500 },
      { before: 2 },
      { after: 2 },
      { ref: { ...message.ref, content_hash: "sha256:changed" } },
    ]) {
      expect(
        workspaceSearchKeys.source("usr_1", { ...base, ...change }),
      ).not.toEqual(key);
    }
    expect(workspaceSearchKeys.source("usr_2", base)).not.toEqual(key);
  });

  it("recognizes messages, immutable summaries, and session sources", () => {
    const summary: WorkspaceSummaryVersion = {
      summary_id: "summary_1",
      revision: 1,
      owner_user_id: "usr_1",
      subject_type: "topic",
      subject_id: "topic_1",
      title: "Database",
      body: "Use PostgreSQL",
      coverage: [],
      created_at: "2026-10-31T12:00:00Z",
    };
    expect(isWorkspaceMessageRead(message)).toBe(true);
    expect(isWorkspaceSummaryVersion(message)).toBe(false);
    expect(isWorkspaceSummaryVersion(summary)).toBe(true);
    expect(isWorkspaceMessageRead(summary)).toBe(false);
    expect(
      isWorkspaceMessageRead({
        kind: "session",
        source_id: "12",
        revision: 1,
        created_at: "",
        deleted: false,
      }),
    ).toBe(false);
  });
});
