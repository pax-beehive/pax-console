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
import type { AgentSession, HistoryMessage } from "@/features/api/types";
import { ApiError, AuthError } from "@/features/api/errors";
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
  history: [] as HistoryMessage[],
  readSource: vi.fn(),
  readHistory: vi.fn(),
  metadataError: null as Error | null,
  historyError: null as Error | null,
}));

vi.mock("@/features/api/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/api/resources")>()),
  useUserSession: () => ({
    data: fixtures.session,
    error: fixtures.metadataError,
  }),
  useNodes: () => ({ data: { nodes: [{ node_id: "node_1", online: true }] } }),
  useNodeAgents: () => ({ data: { agents: [{ agent_id: "agent_1" }] } }),
  useAgentSessions: () => fixtures.emptyQuery,
  useAgentPermissionCatalog: () => fixtures.emptyQuery,
  useSessionConfiguration: () => fixtures.emptyQuery,
  useSessionHistory: () => ({
    ...fixtures.emptyQuery,
    isSuccess: !fixtures.historyError,
    error: fixtures.historyError,
    data: { pages: [{ messages: fixtures.history }] },
  }),
  listSessionHistory: fixtures.readHistory,
  useKnowledgeCapsules: () => fixtures.emptyQuery,
  useKnowledgeInjections: () => fixtures.emptyQuery,
  useSessionArtifacts: () => fixtures.emptyQuery,
  useAgentOwnerInfos: () => fixtures.emptyQuery,
  getQueuedSessionTurn: vi.fn().mockResolvedValue(null),
  queueSessionTurn: fixtures.queueTurn,
  steerSessionTurn: fixtures.steerTurn,
}));
vi.mock("@/features/api/workspace-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/api/workspace-search")>()),
  readWorkspaceSource: fixtures.readSource,
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
    messages: fixtures.history,
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
  fixtures.history = [];
  fixtures.metadataError = null;
  fixtures.historyError = null;
  fixtures.readSource.mockReset();
  fixtures.readHistory.mockReset();
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

function workbench(targetMessageId?: string) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SessionWorkbench
          embedded
          sessionId="sess_1"
          targetMessageId={targetMessageId}
          user={{ user_id: "user_1" }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe("Search message navigation in the session workbench", () => {
  function historyMessage(
    id: string,
    seq: number,
    text: string,
    role = "assistant",
  ): HistoryMessage {
    return {
      message_id: id,
      session_id: "sess_1",
      session_seq: seq,
      turn_id: "turn",
      role,
      message_type: role === "user" ? "user_message" : "agent_message_chunk",
      raw_json: { text_layout: "segment" },
      parts: [{ id: seq * 2, part_index: 0, part_type: "text", text }],
    };
  }

  it("reveals and highlights an already loaded canonical target, including every part, instead of its neighboring segment", async () => {
    const target = historyMessage('target:["', 2, "exact first part");
    target.parts!.push({
      id: 5,
      part_index: 1,
      part_type: "text",
      text: " plus second part",
    });
    fixtures.history = [
      historyMessage('target:["-prefix', 1, "neighbor text"),
      target,
      historyMessage("suffix", 3, "following segment"),
    ];
    render(workbench('target:["'));
    const row = screen.getByLabelText("Selected search message");
    expect(row).toHaveTextContent("exact first part plus second part");
    expect(row).not.toHaveTextContent("neighbor text");
    expect(row).not.toHaveTextContent("following segment");
    expect(row).toHaveAttribute("data-message-highlighted", "true");
    expect(document.activeElement).toBe(row);
    expect(fixtures.readSource).not.toHaveBeenCalled();
  });

  it("loads a bounded old window, expands a user message, and returns to the untouched latest timeline", async () => {
    fixtures.history = [historyMessage("latest", 1000, "LATEST TIMELINE")];
    fixtures.readSource.mockResolvedValue({
      message_id: "old-target",
      session_id: "sess_1",
      agent_id: "agent_1",
      session_seq: 1,
    });
    fixtures.readHistory.mockImplementation((_user, _session, _limit, cursor) =>
      Promise.resolve({
        messages: cursor.beforeSeq
          ? [
              historyMessage(
                "old-target",
                1,
                "old user message\n".repeat(6),
                "user",
              ),
            ]
          : [historyMessage("next", 2, "old next answer")],
        pagination: {},
      }),
    );
    render(workbench("old-target"));
    expect(screen.getByText("Finding message…")).toBeInTheDocument();
    const row = await screen.findByLabelText("Selected search message");
    expect(row).toHaveTextContent("old user message");
    expect(row.querySelector(".max-h-\\[3lh\\]")).toBeNull();
    expect(screen.queryByText("LATEST TIMELINE")).not.toBeInTheDocument();
    expect(fixtures.readHistory.mock.calls.map((call) => call[3])).toEqual([
      { beforeSeq: 2 },
      { afterSeq: 1 },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Back to latest" }));
    expect(await screen.findByText("LATEST TIMELINE")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Selected search message"),
    ).not.toBeInTheDocument();
  });

  it("shows a safe unavailable state for a denied target without presenting latest history as a successful jump", async () => {
    fixtures.history = [historyMessage("latest", 1000, "LATEST TIMELINE")];
    fixtures.readSource.mockRejectedValue(new AuthError("Forbidden"));
    render(workbench("denied"));
    expect(
      await screen.findByText(
        "This message was removed or is no longer available to you.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Selected search message"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("LATEST TIMELINE")).not.toBeInTheDocument();
    expect(fixtures.readHistory).not.toHaveBeenCalled();
  });

  it("hides a loaded target when current session authorization is denied", () => {
    fixtures.history = [historyMessage("target", 1, "cached protected body")];
    fixtures.metadataError = new AuthError("Forbidden");
    render(workbench("target"));
    expect(
      screen.getByText(
        "This message was removed or is no longer available to you.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("cached protected body")).not.toBeInTheDocument();
    expect(fixtures.readSource).not.toHaveBeenCalled();
  });

  it("offers a retry when initial session history fails instead of remaining in loading", () => {
    fixtures.historyError = new ApiError("Temporary outage", 503, {});
    render(workbench("old-target"));
    expect(
      screen.getByText("Could not load this message. Please try again."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Finding message…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry message" }));
    expect(fixtures.emptyQuery.refetch).toHaveBeenCalled();
    expect(fixtures.readSource).not.toHaveBeenCalled();
  });

  it("reports unsupported encrypted message targets instead of starting a plaintext seek", () => {
    fixtures.session = { ...fixtures.session, transport: "e2ee" };
    render(workbench("old-target"));
    expect(
      screen.getByText(
        "This message was removed or is no longer available to you.",
      ),
    ).toBeInTheDocument();
    expect(fixtures.readSource).not.toHaveBeenCalled();
  });

  it("leaves historical focus when steering so the live timeline stays visible", async () => {
    fixtures.history = [historyMessage("target", 1, "selected history")];
    render(workbench("target"));
    expect(
      screen.getByLabelText("Selected search message"),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Steer with this prompt" }),
    );
    await waitFor(() => expect(fixtures.steerTurn).toHaveBeenCalled());
    expect(
      screen.queryByLabelText("Selected search message"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back to latest" }),
    ).not.toBeInTheDocument();
  });

  it("returns to the live timeline before sending a fresh prompt", async () => {
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    fixtures.history = [historyMessage("target", 1, "selected history")];
    render(workbench("target"));
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    await waitFor(() => expect(fixtures.sendMessage).toHaveBeenCalled());
    expect(
      screen.queryByLabelText("Selected search message"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Back to latest" }),
    ).not.toBeInTheDocument();
  });

  it("can revisit the same target after returning to a session-only view without remounting its runtime", () => {
    fixtures.history = [historyMessage("target", 1, "selected history")];
    const { rerender } = render(workbench("target"));
    fireEvent.click(screen.getByRole("button", { name: "Back to latest" }));
    expect(
      screen.queryByLabelText("Selected search message"),
    ).not.toBeInTheDocument();
    rerender(workbench());
    rerender(workbench("target"));
    expect(screen.getByLabelText("Selected search message")).toHaveTextContent(
      "selected history",
    );
  });
});

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
