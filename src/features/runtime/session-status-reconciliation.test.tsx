/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useUserSession } from "../api/resources";
import { queryKeys } from "../api/query-keys";
import { useConversationRun } from "./use-conversation-run";
import { sessionDisplayStatus } from "./session-display-status";
import type { streamConversationRun } from "./conversation-run";

const mocks = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("./conversation-run", async (original) => ({
  ...(await original<typeof import("./conversation-run")>()),
  streamConversationRun: mocks.stream,
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.stream.mockReset();
});

it("uses a fresh REST idle response without remounting, observing running, or receiving an end frame", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(100);
  const session = {
    session_id: "session",
    agent_id: "agent",
    node_id: "node",
    runtime_status: "idle",
    latest_turn_id: "previous-history-turn",
  };
  let reply!: (response: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        reply = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  let stream!: Parameters<typeof streamConversationRun>[0];
  mocks.stream.mockImplementation((options) => {
    stream = options;
    return new Promise(() => {});
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(queryKeys.sessionMetadata("self", "session"), session);
  const { result, unmount } = renderHook(
    () => {
      const metadata = useUserSession("self", "session", undefined, 5_000);
      const run = useConversationRun({
        userId: "self",
        nodeId: "node",
        agentId: "agent",
        sessionId: "session",
        runtimeSnapshot: {
          status: metadata.data?.runtime_status,
          requestedAt: metadata.data?.runtimeSnapshotRequestedAt,
        },
      });
      return {
        metadata,
        run,
        display: sessionDisplayStatus(metadata.data?.runtime_status, {
          ownedConversationStatus: run.status,
          ownedTurnId: run.activeTurnId,
          runtimeTurnId: metadata.data?.runtime_turn_instance_id,
        }),
      };
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  clock.mockReturnValue(200);
  act(() => {
    void result.current.run.sendMessage("hello");
  });
  act(() =>
    stream.onEnvelope({
      type: "turn_started",
      session_id: "session",
      node_id: "node",
      agent_id: "agent",
      turn_id: "current-turn",
    }),
  );
  expect(result.current.display).toBe("streaming");
  const respondIdle = () =>
    reply(
      new Response(JSON.stringify({ code: 0, data: session }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  // The old in-flight read finishes after acceptance, but its request began before it.
  clock.mockReturnValue(300);
  await act(async () => respondIdle());
  await waitFor(() => expect(result.current.metadata.isFetching).toBe(false));
  expect(result.current.metadata.data?.runtimeSnapshotRequestedAt).toBe(100);
  expect(result.current.display).toBe("streaming");
  clock.mockReturnValue(400);
  act(() => {
    void result.current.metadata.refetch();
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await act(async () => respondIdle());
  await waitFor(() => expect(result.current.display).toBe("idle"));
  expect(result.current.metadata.data?.runtimeSnapshotRequestedAt).toBe(400);
  // Clearing the optimistic overlay must not manufacture a permanent "done"
  // that could hide a later server running snapshot for the same turn.
  clock.mockReturnValue(500);
  act(() => {
    void result.current.metadata.refetch();
  });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  await act(async () =>
    reply(
      new Response(
        JSON.stringify({
          code: 0,
          data: {
            ...session,
            runtime_status: "running",
            runtime_turn_instance_id: "current-turn",
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    ),
  );
  await waitFor(() => expect(result.current.display).toBe("streaming"));
  expect(mocks.stream).toHaveBeenCalledTimes(1);
  expect(result.current.run.transportInterrupted).toBe(false);
  unmount();
  client.clear();
});
