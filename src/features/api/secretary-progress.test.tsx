/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSecretaryProgress,
  SecretaryProgressPage,
  secretaryProgressKeys,
  useSecretaryProgress,
} from "./secretary-progress";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const page: SecretaryProgressPage = {
  as_of: "2026-10-31T12:00:00Z",
  counts: {
    total_sessions: 12,
    completed_sessions: 4,
    partial_sessions: 3,
    unstarted_sessions: 5,
    total_messages: 100,
    completed_messages: 40,
    pending_messages: 60,
    total_turns: 50,
    completed_turns: 20,
    pending_turns: 30,
    ungrouped_messages: 0,
  },
  sessions: [
    {
      source_id: "1",
      agent_id: "agent_1",
      session_id: "session_1",
      title: "First session",
      state: "partial",
      total_messages: 10,
      completed_messages: 4,
      pending_messages: 6,
      total_turns: 5,
      completed_turns: 2,
      pending_turns: 3,
      ungrouped_messages: 0,
    },
  ],
};
function response(value: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      code: status,
      data: value,
      message: status === 400 ? "invalid cursor" : "ok",
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}
function wrapper() {
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

describe("Secretary progress API", () => {
  it("GETs bounded pagination through the authenticated same-origin proxy", async () => {
    fetchMock.mockResolvedValue(response(page));
    const signal = new AbortController().signal;
    await expect(
      getSecretaryProgress("self", { limit: 20, cursor: "opaque+/=" }, signal),
    ).resolves.toEqual(page);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/pax/api/v1/user/self/secretary/progress?limit=20&cursor=opaque%2B%2F%3D",
    );
    expect(init).toMatchObject({ credentials: "include", signal });
    expect(init?.body).toBeUndefined();
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
  });
  it("does not fetch without an authenticated user", () => {
    renderHook(() => useSecretaryProgress(undefined), wrapper());
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("loads progress independently of enabled settings and isolates users", async () => {
    fetchMock.mockImplementation(async () => response(page));
    const context = wrapper();
    const hook = renderHook(({ id }) => useSecretaryProgress(id), {
      ...context,
      initialProps: { id: "owner_a" },
    });
    await waitFor(() =>
      expect(hook.result.current.data?.pages[0]).toEqual(page),
    );
    hook.rerender({ id: "owner_b" });
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() =>
      expect(hook.result.current.data?.pages[0]).toEqual(page),
    );
    expect(
      context.client.getQueryData(secretaryProgressKeys.progress("owner_a")),
    ).toBeDefined();
    expect(
      fetchMock.mock.calls.every(
        ([url, init]) =>
          String(url).includes("/secretary/progress?") &&
          (!init?.method || init.method === "GET"),
      ),
    ).toBe(true);
  });
  it("loads the next opaque cursor while retaining authoritative aggregate counts", async () => {
    fetchMock.mockImplementation(async (url) =>
      response(
        String(url).includes("cursor=next")
          ? {
              ...page,
              sessions: [
                {
                  ...page.sessions[0],
                  source_id: "2",
                  session_id: "session_2",
                },
              ],
            }
          : { ...page, next_cursor: "next" },
      ),
    );
    const hook = renderHook(() => useSecretaryProgress("self"), wrapper());
    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
    await act(async () => {
      await hook.result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(hook.result.current.data?.pages).toHaveLength(2),
    );
    expect(hook.result.current.data?.pages[0].counts.total_sessions).toBe(12);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/progress?limit=20&cursor=next",
    );
  });
  it("replaces loaded pages on refresh instead of appending stale sessions", async () => {
    let fresh = false;
    fetchMock.mockImplementation(async (url) =>
      response(
        fresh
          ? {
              ...page,
              sessions: [
                {
                  ...page.sessions[0],
                  source_id: "new",
                  title: "Updated source",
                },
              ],
            }
          : String(url).includes("cursor=")
            ? {
                ...page,
                sessions: [{ ...page.sessions[0], source_id: "old-next" }],
              }
            : { ...page, next_cursor: "next" },
      ),
    );
    const hook = renderHook(() => useSecretaryProgress("self"), wrapper());
    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
    await act(async () => {
      await hook.result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(hook.result.current.data?.pages).toHaveLength(2),
    );
    fresh = true;
    await act(async () => {
      await hook.result.current.refetch();
    });
    await waitFor(() =>
      expect(hook.result.current.data?.pages[0].sessions[0].source_id).toBe(
        "new",
      ),
    );
    expect(hook.result.current.data?.pages).toHaveLength(1);
  });
  it("restarts expired pagination from the first page and does not retry invalid cursors", async () => {
    let expired = true;
    fetchMock.mockImplementation(async (url) =>
      String(url).includes("cursor=") && expired
        ? response({}, 400)
        : response({ ...page, next_cursor: "next" }),
    );
    const hook = renderHook(() => useSecretaryProgress("self"), wrapper());
    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
    await act(async () => {
      await hook.result.current.fetchNextPage();
    });
    await waitFor(() =>
      expect(hook.result.current.isFetchNextPageError).toBe(true),
    );
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).includes("cursor="))
        .length,
    ).toBe(1);
    expired = false;
    await act(async () => {
      await hook.result.current.restart();
    });
    await waitFor(() => expect(hook.result.current.isError).toBe(false));
    expect(hook.result.current.data?.pages).toHaveLength(1);
    expect(String(fetchMock.mock.calls.at(-1)?.[0])).not.toContain("cursor=");
  });
});
