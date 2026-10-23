/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryKeys } from "@/features/api/query-keys";
import type { AgentSession } from "@/features/api/types";
import type { ConversationRunStatus } from "@/features/runtime/use-conversation-run";
import { useConsoleStore } from "@/stores/console-store";
import { SessionWorkbench } from "./session-workbench";

const fixtures = vi.hoisted(() => ({
  session: {
    session_id: "sess_1",
    agent_id: "agent_1",
    node_id: "node_1",
    runtime_status: "running",
    transport: "manager",
  } as AgentSession,
  localStatus: "idle" as ConversationRunStatus,
  encryptedStatus: "idle" as ConversationRunStatus,
  sendMessage: vi.fn().mockResolvedValue({ sessionId: "sess_1" }),
  sendEncryptedMessage: vi.fn().mockResolvedValue(undefined),
  queueTurn: vi.fn().mockResolvedValue(undefined),
  steerTurn: vi.fn().mockResolvedValue(undefined),
  observe: vi.fn(),
  emptyEvents: [],
  emptyQuery: { data: undefined, refetch: vi.fn() },
}));

vi.mock("@/features/api/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/api/resources")>()),
  useUserSession: () => ({ data: fixtures.session }),
  useNodes: () => ({ data: { nodes: [{ node_id: "node_1", online: true }] } }),
  useNodeAgents: () => ({ data: { agents: [{ agent_id: "agent_1" }] } }),
  useAgentSessions: () => fixtures.emptyQuery,
  useAgentPermissionCatalog: () => fixtures.emptyQuery,
  useSessionConfiguration: () => fixtures.emptyQuery,
  useSessionHistory: () => fixtures.emptyQuery,
  useKnowledgeCapsules: () => fixtures.emptyQuery,
  useKnowledgeInjections: () => fixtures.emptyQuery,
  useSessionArtifacts: () => fixtures.emptyQuery,
  useAgentOwnerInfos: () => fixtures.emptyQuery,
  getQueuedSessionTurn: vi.fn().mockResolvedValue(null),
  queueSessionTurn: fixtures.queueTurn,
  steerSessionTurn: fixtures.steerTurn,
}));
vi.mock("@/features/runtime/use-conversation-run", () => ({
  useConversationRun: () => ({
    status: fixtures.localStatus,
    events: fixtures.emptyEvents,
    sendMessage: fixtures.sendMessage,
    completedTurnVersion: 0,
  }),
}));
vi.mock("@/features/runtime/session-observer", () => ({
  useSessionObserver: (options: unknown) => {
    fixtures.observe(options);
    return { events: fixtures.emptyEvents, status: "observing" };
  },
}));
vi.mock("@/features/runtime/use-session-history-sync", () => ({
  useSessionHistorySync: () => ({
    messages: fixtures.emptyEvents,
    calibratedTurnIds: fixtures.emptyEvents,
    snapshotTurnIds: fixtures.emptyEvents,
    calibrate: vi.fn(),
  }),
}));
vi.mock("@/features/e2ee/use-e2ee-session-runtime", () => ({
  useE2EESessionRuntime: () => ({
    status: fixtures.encryptedStatus,
    events: fixtures.emptyEvents,
    historyEvents: fixtures.emptyEvents,
    historyQuery: fixtures.emptyQuery,
    rootKeyAvailable: true,
    sendMessage: fixtures.sendEncryptedMessage,
  }),
}));
vi.mock("./session-browser-approvals", () => ({
  SessionBrowserApprovals: () => null,
}));
vi.mock("./session-browser-window", () => ({
  SessionBrowserWindow: () => null,
}));

let queryClient: QueryClient;
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  fixtures.session = {
    ...fixtures.session,
    runtime_status: "running",
    transport: "manager",
  };
  fixtures.localStatus = "idle";
  fixtures.encryptedStatus = "idle";
  useConsoleStore.setState({ composerDrafts: { sess_1: "next prompt" } });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  useConsoleStore.setState({ composerDrafts: {} });
});

function workbench() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SessionWorkbench
          embedded
          sessionId="sess_1"
          user={{ user_id: "user_1" }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe("SessionWorkbench composer status", () => {
  it("steers directly from the composer and clears the accepted draft", async () => {
    render(workbench());
    const steer = screen.getByRole("button", {
      name: "Steer with this prompt",
    });
    expect(steer).not.toHaveClass("hidden");
    expect(
      screen.queryByRole("button", { name: "More turn actions" }),
    ).not.toBeInTheDocument();
    fireEvent.click(steer);
    await waitFor(() =>
      expect(fixtures.steerTurn).toHaveBeenCalledWith(
        "user_1",
        "agent_1",
        "sess_1",
        { input: "next prompt" },
      ),
    );
    await waitFor(() =>
      expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(""),
    );
    expect(fixtures.queueTurn).not.toHaveBeenCalled();
  });

  it("keeps the draft available when steering fails", async () => {
    fixtures.steerTurn.mockRejectedValueOnce(new Error("Steering failed"));
    render(workbench());
    fireEvent.click(
      screen.getByRole("button", { name: "Steer with this prompt" }),
    );
    await screen.findByText(/Steering failed/);
    expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(
      "next prompt",
    );
  });

  it("sends a fresh prompt after running becomes idle even while a queued turn is being followed", async () => {
    const queuedKey = queryKeys.queuedSessionTurn(
      "user_1",
      "agent_1",
      "sess_1",
    );
    queryClient.setQueryData(queuedKey, {
      queued_turn_id: "queued_1",
      input: "queued prompt",
      session_id: "sess_1",
      agent_id: "agent_1",
      command_id: "cmd_1",
      created_at: "2026-10-04T00:00:00Z",
      updated_at: "2026-10-04T00:00:00Z",
    });
    const view = render(workbench());
    expect(
      screen.getByRole("button", { name: "Queue after current turn" }),
    ).toBeEnabled();

    // The queue has started, but its completion notification has not arrived.
    const observerOptions = fixtures.observe.mock.lastCall?.[0] as {
      onQueuedTurnStarted: () => void;
    };
    act(() => observerOptions.onQueuedTurnStarted());
    await waitFor(() => expect(queryClient.getQueryData(queuedKey)).toBeNull());
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    view.rerender(workbench());

    expect(screen.getAllByText("idle").length).toBeGreaterThan(0);
    expect(fixtures.observe).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, followQueuedTurn: true }),
    );
    const send = screen.getByRole("button", { name: "Send prompt" });
    expect(send).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Queue after current turn" }),
    ).not.toBeInTheDocument();
    fireEvent.click(send);
    await waitFor(() =>
      expect(fixtures.sendMessage).toHaveBeenCalledWith(
        "next prompt",
        expect.any(Object),
      ),
    );
    expect(fixtures.queueTurn).not.toHaveBeenCalled();
  });

  it.each(["done", "cancelled", "error"] as const)(
    "allows sending after local %s despite a stale running snapshot",
    (status) => {
      fixtures.localStatus = status;
      render(workbench());
      expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
    },
  );

  it.each(["running", "waiting_approval", "unknown"] as const)(
    "keeps canonical %s from accepting a fresh prompt",
    (runtime_status) => {
      fixtures.session = { ...fixtures.session, runtime_status };
      render(workbench());
      expect(
        screen.queryByRole("button", { name: "Send prompt" }),
      ).not.toBeInTheDocument();
    },
  );

  it("keeps a newly submitted local turn active before the running snapshot arrives", () => {
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    fixtures.localStatus = "streaming";
    render(workbench());
    expect(
      screen.getByRole("button", { name: "Queue after current turn" }),
    ).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Send prompt" }),
    ).not.toBeInTheDocument();
  });

  it("allows an encrypted follow-up after local completion despite a stale running snapshot", async () => {
    fixtures.session = { ...fixtures.session, transport: "e2ee" };
    fixtures.encryptedStatus = "done";
    render(workbench());
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    await waitFor(() =>
      expect(fixtures.sendEncryptedMessage).toHaveBeenCalledWith(
        "next prompt",
        [],
      ),
    );
  });
});
