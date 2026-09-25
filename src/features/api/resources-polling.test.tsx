/* @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useNodes, useUserSession } from "./resources";
import { queryKeys } from "./query-keys";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("./client", () => ({
  apiFetch: mocks.fetch,
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));
afterEach(() => {
  vi.useRealTimers();
  mocks.fetch.mockReset();
  focusManager.setFocused(undefined);
});

it("polls node recovery and idle session heads, pauses hidden polling and refreshes nodes on focus", async () => {
  vi.useFakeTimers();
  focusManager.setFocused(true);
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
    },
  });
  const session = {
    session_id: "s",
    agent_id: "a",
    node_id: "n",
    runtime_status: "idle",
  };
  client.setQueryData(queryKeys.sessionMetadata("self", "s"), session);
  let online = false;
  let latest = "old";
  mocks.fetch.mockImplementation(async (path: string) =>
    path.endsWith("/nodes")
      ? { nodes: [{ node_id: "n", online }] }
      : { ...session, latest_message_id: latest, latest_turn_id: latest },
  );
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, unmount } = renderHook(
    () => ({
      nodes: useNodes("self", 5_000),
      session: useUserSession("self", "s", undefined, 5_000),
    }),
    { wrapper },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.nodes.data?.nodes[0].online).toBe(false);
  online = true;
  latest = "new";
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(result.current.nodes.data?.nodes[0].online).toBe(true);
  expect(result.current.session.data?.latest_message_id).toBe("new");
  expect(result.current.session.data?.latest_turn_id).toBe("new");
  act(() => focusManager.setFocused(false));
  const count = mocks.fetch.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5_000);
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(count);
  online = false;
  await act(async () => {
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(result.current.nodes.data?.nodes[0].online).toBe(false);
  unmount();
  client.clear();
});
