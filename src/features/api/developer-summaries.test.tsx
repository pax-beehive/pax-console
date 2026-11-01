/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  developerSummaryKeys,
  getDeveloperSummary,
  listDeveloperSummaries,
  useDeveloperSummaries,
  useDeveloperSummary,
} from "./developer-summaries";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

describe("developer summary HTTP contract", () => {
  it("lists without keywords through the same-origin self endpoint", async () => {
    fetchMock.mockResolvedValue(
      response({ items: [], next_cursor: "cursor+2" }),
    );
    const signal = new AbortController().signal;
    await expect(listDeveloperSummaries("cursor+1", signal)).resolves.toEqual({
      items: [],
      next_cursor: "cursor+2",
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pax/api/v1/user/self/developer/summaries?limit=20&cursor=cursor%2B1",
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      signal,
      credentials: "include",
    });
  });

  it("encodes the requested summary ID and exact revision", async () => {
    fetchMock.mockImplementation(async () =>
      response({ summary: { revision: 3 } }),
    );
    await expect(
      getDeveloperSummary({ id: "summary/a", revision: 3 }),
    ).resolves.toEqual({ summary: { revision: 3 } });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pax/api/v1/user/self/developer/summaries/summary%2Fa?revision=3",
    );
    await getDeveloperSummary({ id: "summary_current" });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/pax/api/v1/user/self/developer/summaries/summary_current",
    );
  });
});

describe("developer summary query lifecycle", () => {
  it("follows the server cursor even when every candidate in a page is inaccessible", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [], next_cursor: "next" }))
      .mockResolvedValueOnce(response({ items: [{ summary_id: "last" }] }));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useDeveloperSummaries("admin"), {
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

  it("does not fetch without a principal or selected reference", () => {
    const { wrapper } = queryWrapper();
    renderHook(() => useDeveloperSummaries(undefined), { wrapper });
    renderHook(() => useDeveloperSummary("admin", undefined), { wrapper });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("isolates current and historical caches by admin identity and revision", () => {
    expect(developerSummaryKeys.list("a")).not.toEqual(
      developerSummaryKeys.list("b"),
    );
    expect(developerSummaryKeys.detail("a", { id: "s" })).not.toEqual(
      developerSummaryKeys.detail("a", { id: "s", revision: 2 }),
    );
    expect(developerSummaryKeys.detail("a", { id: "s" })).not.toEqual(
      developerSummaryKeys.detail("b", { id: "s" }),
    );
  });

  it.each([400, 401, 403, 404, 409])(
    "does not retry HTTP %i",
    async (status) => {
      fetchMock.mockImplementation(async () => response(null, status));
      const { wrapper } = queryWrapper();
      const { result } = renderHook(() => useDeveloperSummaries("admin"), {
        wrapper,
      });
      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );

  it("restarts pagination without retaining an expired cursor", async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [], next_cursor: "old" }))
      .mockResolvedValueOnce(response({ items: [], next_cursor: "fresh" }));
    const { wrapper } = queryWrapper();
    const { result } = renderHook(() => useDeveloperSummaries("admin"), {
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

  it("cancels detail reads when the protected view is unmounted", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { wrapper } = queryWrapper();
    const { unmount } = renderHook(
      () => useDeveloperSummary("admin", { id: "s", revision: 1 }),
      { wrapper },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0][1]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
