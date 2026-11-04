/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSecretarySummaries,
  getSecretarySummary,
  getSecretarySummaryRevisions,
  useSecretarySummaryRevisions,
  secretarySummaryKeys,
  useSecretarySummaries,
  useSecretarySummary,
} from "./secretary-summaries";
import type { WorkspaceSummaryVersion } from "./workspace-search";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const summary: WorkspaceSummaryVersion = {
  summary_id: "summary_1",
  revision: 3,
  owner_user_id: "user_1",
  subject_type: "topic",
  subject_id: "secretary:session:source_1",
  title: "Search design",
  body: "Search reads only the owner's data.",
  claims: [],
  coverage: [
    {
      message_id: "message_1",
      content_hash: "frozen_hash",
      canonicalization_version: "v1",
    },
  ],
  created_at: "2026-11-02T18:00:00Z",
};

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function queryWrapper(staleTime = 0) {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity, staleTime } },
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

describe("Secretary summary HTTP contract", () => {
  it("browses published summaries without a search query or administrator endpoint", async () => {
    fetchMock.mockResolvedValue(response({ items: [], next_cursor: "next+2" }));
    const controller = new AbortController();
    await expect(
      getSecretarySummaries("self", "next+1", controller.signal),
    ).resolves.toEqual({ items: [], next_cursor: "next+2" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/pax/api/v1/user/self/secretary/summaries?limit=20&cursor=next%2B1",
    );
    expect(init).toMatchObject({ credentials: "include", method: "GET" });
    expect(init?.body).toBeUndefined();
    expect(init?.signal?.aborted).toBe(false);
    expect(controller.signal.aborted).toBe(false);
  });

  it("reads an exact published version through the existing owner-checked source reader", async () => {
    fetchMock.mockResolvedValue(response(summary));
    await expect(
      getSecretarySummary("self", { id: "summary_1", revision: 3 }),
    ).resolves.toEqual(summary);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pax/api/v1/user/self/search/read");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      ref: { kind: "summary", id: "summary_1", revision: 3 },
    });
  });

  it("lets the backend choose current revision and does not forward extra identity fields", async () => {
    fetchMock.mockResolvedValue(response(summary));
    await getSecretarySummary("self", {
      id: "summary_1",
      owner_user_id: "other_user",
      kind: "message",
    } as { id: string });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      ref: { kind: "summary", id: "summary_1" },
    });
  });

  it.each([
    null,
    { message_id: "message_1", text: "not a summary" },
    { ...summary, summary_id: "different_summary" },
    { ...summary, revision: 2 },
  ])(
    "rejects a response that does not match the requested summary version",
    async (data) => {
      fetchMock.mockResolvedValue(response(data));
      await expect(
        getSecretarySummary("self", { id: "summary_1", revision: 3 }),
      ).rejects.toMatchObject({ name: "ApiError", status: 502 });
    },
  );

  it("propagates permission and version failures rather than using another revision", async () => {
    fetchMock.mockResolvedValue(response(null, 409));
    await expect(
      getSecretarySummary("self", { id: "summary_1", revision: 3 }),
    ).rejects.toMatchObject({ name: "ApiError", status: 409 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("Secretary summary revisions", () => {
  it("requests an encoded summary ID and its own revision cursor", async () => {
    fetchMock.mockResolvedValue(response({ items: [], next_cursor: "next+2" }));
    await expect(
      getSecretarySummaryRevisions("self", "id /&", "next+1"),
    ).resolves.toEqual({ items: [], next_cursor: "next+2" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/summaries/id%20%2F%26/revisions?limit=20&cursor=next%2B1",
    );
  });
  it("does not fetch hidden revision history", () => {
    const { wrapper } = queryWrapper();
    renderHook(
      () => useSecretarySummaryRevisions("user_1", "summary_1", false),
      { wrapper },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("rechecks a warm revision page when history is reopened", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [], next_cursor: "next" }))
      .mockImplementationOnce(() => new Promise(() => {}));
    const { wrapper } = queryWrapper(15_000);
    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useSecretarySummaryRevisions("user_1", "summary_1", enabled),
      { wrapper, initialProps: { enabled: true } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ enabled: false });
    rerender({ enabled: true });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.isFetching).toBe(true);
    expect(fetchMock.mock.calls[1][0]).not.toContain("cursor=");
  });
  it("isolates revision history from other summaries and users", () => {
    expect(secretarySummaryKeys.revisions("a", "s1")).not.toEqual(
      secretarySummaryKeys.revisions("a", "s2"),
    );
    expect(secretarySummaryKeys.revisions("a", "s1")).not.toEqual(
      secretarySummaryKeys.revisions("b", "s1"),
    );
    expect(secretarySummaryKeys.revisions("a", "s1")).not.toEqual(
      secretarySummaryKeys.list("a"),
    );
  });
});

describe("Secretary summary query lifecycle", () => {
  it("follows an empty permission-filtered page's server continuation", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [], next_cursor: "next" }))
      .mockResolvedValueOnce(
        response({ items: [{ summary_id: "summary_1" }] }),
      );
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSecretarySummaries("user_1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
    expect(fetchMock.mock.calls[1][0]).toContain("cursor=next");
  });

  it("does not fetch without an authenticated principal or selected summary", () => {
    const { wrapper } = queryWrapper();
    renderHook(() => useSecretarySummaries(undefined), { wrapper });
    renderHook(() => useSecretarySummary("user_1", undefined), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates list and exact-version caches by user identity", () => {
    expect(secretarySummaryKeys.list("a")).not.toEqual(
      secretarySummaryKeys.list("b"),
    );
    expect(secretarySummaryKeys.detail("a", { id: "s" })).not.toEqual(
      secretarySummaryKeys.detail("a", { id: "s", revision: 2 }),
    );
    expect(
      secretarySummaryKeys.detail("a", { id: "s", revision: 2 }),
    ).not.toEqual(secretarySummaryKeys.detail("b", { id: "s", revision: 2 }));
  });

  it("revalidates a fresh list cache when the reader mounts", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { client, wrapper } = queryWrapper(15_000);
    client.setQueryData(secretarySummaryKeys.list("user_1"), {
      pages: [{ items: [] }],
      pageParams: [undefined],
    });
    const { result } = renderHook(() => useSecretarySummaries("user_1"), {
      wrapper,
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(result.current.isFetching).toBe(true);
    expect(result.current.isFetchedAfterMount).toBe(false);
  });

  it("rechecks access to a freshly cached summary instead of trusting its last read", async () => {
    fetchMock.mockResolvedValue(response(null, 403));
    const { client, wrapper } = queryWrapper(15_000);
    const selection = { id: "summary_1", revision: 3 };
    client.setQueryData(
      secretarySummaryKeys.detail("user_1", selection),
      summary,
    );
    const { result } = renderHook(
      () => useSecretarySummary("user_1", selection),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.current.error).toMatchObject({ name: "AuthError" });
  });

  it("does not retain the previous user's data while loading the next account", async () => {
    fetchMock
      .mockResolvedValueOnce(response(summary))
      .mockImplementationOnce(() => new Promise(() => {}));
    const { wrapper } = queryWrapper();
    const { result, rerender } = renderHook(
      ({ userId }) =>
        useSecretarySummary(userId, { id: "summary_1", revision: 3 }),
      { wrapper, initialProps: { userId: "user_1" } },
    );
    await waitFor(() => expect(result.current.data).toEqual(summary));
    rerender({ userId: "user_2" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it.each([400, 401, 403, 404, 409])(
    "does not retry HTTP %i",
    async (status) => {
      fetchMock.mockImplementation(async () => response(null, status));
      const { wrapper } = queryWrapper();
      const { result } = renderHook(() => useSecretarySummaries("user_1"), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it.each(["AbortError", "TimeoutError"])(
    "does not automatically repeat a request after %s",
    async (name) => {
      fetchMock.mockRejectedValue(new DOMException("Request stopped", name));
      const { wrapper } = queryWrapper();
      const { result } = renderHook(() => useSecretarySummaries("user_1"), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("bounds automatic recovery attempts for a temporary service failure", async () => {
    fetchMock.mockImplementation(async () => response(null, 503));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSecretarySummaries("user_1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("restarts from the first page instead of retaining an expired cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [], next_cursor: "old" }))
      .mockResolvedValueOnce(response({ items: [], next_cursor: "fresh" }));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useSecretarySummaries("user_1"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => {
      await result.current.restart();
    });
    expect(fetchMock.mock.calls[1][0]).not.toContain("cursor=");
    await waitFor(() =>
      expect(result.current.data?.pages[0].next_cursor).toBe("fresh"),
    );
  });

  it("cancels an in-flight detail read when its view unmounts", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { wrapper } = queryWrapper();
    const { unmount } = renderHook(
      () => useSecretarySummary("user_1", { id: "summary_1", revision: 3 }),
      { wrapper },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
