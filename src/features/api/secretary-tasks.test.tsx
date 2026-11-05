/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSecretaryTask,
  getSecretaryTasks,
  controlSecretaryTask,
  useSecretaryTasks,
  useSecretaryTaskAction,
  type SecretaryTask,
} from "./secretary-tasks";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const task: SecretaryTask = {
  task_id: "42",
  session_id: "source",
  source_agent_id: "agent",
  title: "A task",
  secretary_agent_id: "secretary",
  revision: 3,
  settings_revision: 2,
  retry_epoch: 4,
  batch_id: "batch",
  attempt_id: "attempt",
  execution_state: "unknown",
  paused: false,
  attempt_count: 1,
  connection_failures: 0,
  lease_active: false,
};
function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ code: status, data, message: "conflict" }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}
function context() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
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

describe("Secretary task HTTP contract", () => {
  it("reads bounded task and attempt pages through the same-origin user route", async () => {
    fetchMock.mockImplementation(async () => response({ items: [task] }));
    await getSecretaryTasks("self");
    await getSecretaryTask("self", "42/other", { cursor: "next+page" });
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/tasks?limit=20",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/tasks/42%2Fother?limit=20&cursor=next%2Bpage",
    );
    expect(
      fetchMock.mock.calls.every(([, init]) => init?.method === "GET"),
    ).toBe(true);
  });
  it("sends only one task action and exact observed control identities", async () => {
    fetchMock.mockResolvedValue(response({ task, outcome: "queued" }));
    await controlSecretaryTask("self", "42", {
      action: "retry",
      expected_revision: 3,
      batch_id: "batch",
      attempt_id: "attempt",
      retry_epoch: 4,
      settings_revision: 2,
      confirm_restart: true,
      owner_user_id: "other",
      source_id: "all",
    } as Parameters<typeof controlSecretaryTask>[2]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/tasks/42/actions",
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      action: "retry",
      expected_revision: 3,
      batch_id: "batch",
      attempt_id: "attempt",
      retry_epoch: 4,
      settings_revision: 2,
      confirm_restart: true,
    });
  });
});

describe("Secretary task query state", () => {
  it("does not load tasks without an authenticated user", () => {
    renderHook(() => useSecretaryTasks(undefined), context());
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([409, 503])(
    "refreshes task state after HTTP %s without repeating the POST",
    async (status) => {
      let current = task;
      fetchMock.mockImplementation(async (_url, init) => {
        if (init?.method === "POST") {
          current = { ...task, revision: 4, paused: true };
          return response({}, status);
        }
        return response({ items: [current] });
      });
      const hook = renderHook(
        () => ({
          list: useSecretaryTasks("self"),
          action: useSecretaryTaskAction("self", "42"),
        }),
        context(),
      );
      await waitFor(() =>
        expect(hook.result.current.list.data?.pages[0].items[0].revision).toBe(
          3,
        ),
      );
      act(() =>
        hook.result.current.action.mutate({
          action: "pause",
          expected_revision: 3,
          batch_id: "batch",
          attempt_id: "attempt",
          retry_epoch: 4,
          settings_revision: 2,
        }),
      );
      await waitFor(() =>
        expect(hook.result.current.action.isError).toBe(true),
      );
      await waitFor(() =>
        expect(hook.result.current.list.data?.pages[0].items[0].revision).toBe(
          4,
        ),
      );
      expect(
        fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(1);
    },
  );
  it("paginates without changing the submitted task query", async () => {
    fetchMock.mockImplementation(async (url) =>
      response(
        String(url).includes("cursor=")
          ? { items: [{ ...task, task_id: "43" }] }
          : { items: [task], next_cursor: "next" },
      ),
    );
    const hook = renderHook(() => useSecretaryTasks("self"), context());
    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
    await act(async () => {
      await hook.result.current.fetchNextPage();
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/tasks?limit=20&cursor=next",
    );
    await waitFor(() =>
      expect(hook.result.current.data?.pages).toHaveLength(2),
    );
  });
});
