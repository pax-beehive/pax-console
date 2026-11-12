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
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryKeys } from "@/features/api/query-keys";
import type {
  AgentSession,
  HistoryMessage,
  TurnSearchAccess,
} from "@/features/api/types";
import { ApiError, AuthError } from "@/features/api/errors";
import { mergeEvents } from "@/features/runtime/merge-session-events";
import { normalizeTunnelFrame } from "@/features/runtime/normalize-tunnel-frame";
import type { SessionEvent } from "@/features/runtime/session-events";
import type { ConversationRunStatus } from "@/features/runtime/use-conversation-run";
import { useConsoleStore } from "@/stores/console-store";
import { SessionWorkbench } from "./session-workbench";
import { MOBILE_PREPARATION_PROMPT } from "@/features/mobile-control/preparation";

const fixtures = vi.hoisted(() => ({
  session: {
    session_id: "sess_1",
    agent_id: "agent_1",
    node_id: "node_1",
    runtime_status: "running",
    transport: "manager",
  } as AgentSession,
  localStatus: "idle" as ConversationRunStatus,
  conversationError: null as Error | null,
  encryptedStatus: "idle" as ConversationRunStatus,
  sendMessage: vi.fn().mockResolvedValue({ sessionId: "sess_1" }),
  sendEncryptedMessage: vi.fn().mockResolvedValue(undefined),
  queueTurn: vi.fn().mockResolvedValue(undefined),
  steerTurn: vi.fn().mockResolvedValue(undefined),
  observe: vi.fn(),
  emptyEvents: [],
  conversationEvents: [] as SessionEvent[],
  emptyQuery: { data: undefined, refetch: vi.fn() },
  history: [] as HistoryMessage[],
  calibratedTurnIds: [] as string[],
  refetchHistory: vi.fn().mockResolvedValue(undefined),
  readSource: vi.fn(),
  readHistory: vi.fn(),
  metadataError: null as Error | null,
  historyError: null as Error | null,
  nodeOnline: true,
  keyLoading: false,
  rootKeyAvailable: true,
  preparePhone: null as (() => Promise<boolean>) | null,
  createAttachment: vi
    .fn()
    .mockRejectedValue(new Error("Attachment upload failed")),
}));

vi.mock("@/features/api/resources", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/api/resources")>()),
  useUserSession: () => ({
    data: fixtures.session,
    error: fixtures.metadataError,
  }),
  useNodes: () => ({
    data: { nodes: [{ node_id: "node_1", online: fixtures.nodeOnline }] },
  }),
  useNodeAgents: () => ({
    data: { agents: [{ agent_id: "agent_1", agent_type: "claude-code" }] },
  }),
  useAgentSessions: () => fixtures.emptyQuery,
  useAgentPermissionCatalog: () => fixtures.emptyQuery,
  useSessionConfiguration: () => fixtures.emptyQuery,
  useSessionHistory: () => ({
    ...fixtures.emptyQuery,
    refetch: fixtures.refetchHistory,
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
  createUserAttachment: fixtures.createAttachment,
}));
vi.mock("@/features/api/workspace-search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/api/workspace-search")>()),
  readWorkspaceSource: fixtures.readSource,
}));
vi.mock("@/features/runtime/use-conversation-run", () => ({
  useConversationRun: () => ({
    status: fixtures.localStatus,
    error: fixtures.conversationError,
    events: fixtures.conversationEvents,
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
    calibratedTurnIds: fixtures.calibratedTurnIds,
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
    rootKeyAvailable: fixtures.rootKeyAvailable,
    keyLoading: fixtures.keyLoading,
    sendMessage: fixtures.sendEncryptedMessage,
  }),
}));
vi.mock("./session-browser-approvals", () => ({
  SessionBrowserApprovals: () => null,
}));
vi.mock("./session-browser-window", () => ({
  SessionBrowserWindow: () => null,
}));
vi.mock("./session-mobile-window", () => ({
  SessionMobileWindow: ({
    onPrepare,
    prepareDisabled,
  }: {
    onPrepare?: () => Promise<boolean>;
    prepareDisabled?: boolean;
  }) => {
    fixtures.preparePhone = onPrepare ?? null;
    return (
      <button disabled={prepareDisabled} onClick={() => void onPrepare?.()}>
        Add preparation instructions to chat
      </button>
    );
  },
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
  fixtures.conversationError = null;
  fixtures.encryptedStatus = "idle";
  fixtures.conversationEvents = [];
  fixtures.history = [];
  fixtures.calibratedTurnIds = [];
  fixtures.refetchHistory.mockClear();
  fixtures.metadataError = null;
  fixtures.historyError = null;
  fixtures.nodeOnline = true;
  fixtures.keyLoading = false;
  fixtures.rootKeyAvailable = true;
  fixtures.preparePhone = null;
  fixtures.sendMessage.mockReset().mockResolvedValue({ sessionId: "sess_1" });
  fixtures.sendEncryptedMessage.mockReset().mockResolvedValue(undefined);
  fixtures.createAttachment
    .mockReset()
    .mockRejectedValue(new Error("Attachment upload failed"));
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

function workbench(
  targetMessageId?: string,
  initialAttachments?: ComponentProps<
    typeof SessionWorkbench
  >["initialAttachments"],
  searchAccess?: TurnSearchAccess,
) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SessionWorkbench
          embedded
          sessionId="sess_1"
          targetMessageId={targetMessageId}
          initialAttachments={initialAttachments}
          initialSearchAccess={searchAccess}
          user={{ user_id: "user_1" }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

describe("agent sign-in recovery", () => {
  it("offers Settings sign-in after an explicit agent authentication failure", () => {
    fixtures.localStatus = "error";
    fixtures.conversationError = new Error("Authentication required");
    render(workbench());
    const href = screen
      .getByRole("link", { name: "Open Agent sign-in" })
      .getAttribute("href")!;
    const url = new URL(href, "https://paxworkspace.net");
    expect(url.searchParams.get("node_id")).toBe("node_1");
    expect(url.searchParams.get("session_id")).toBe("sess_1");
    expect(url.searchParams.get("harness")).toBe("claude");
  });

  it("does not infer failure from an ordinary assistant message about authentication", () => {
    fixtures.conversationEvents = [
      {
        type: "agent_message",
        id: "explanation",
        sessionId: "sess_1",
        content:
          "Failed to authenticate: OAuth session expired and could not be refreshed",
        createdAt: "2026-11-12T05:39:48Z",
      },
    ];
    render(workbench());
    expect(
      screen.queryByRole("link", { name: "Open Agent sign-in" }),
    ).not.toBeInTheDocument();
  });
});

describe("agent-owned Android preparation", () => {
  const attachment = {
    attachmentId: "unsent-file",
    filename: "private-notes.txt",
    contentType: "text/plain",
    sizeBytes: 12,
  };
  function openPhone() {
    fireEvent.click(screen.getByRole("button", { name: "Open session panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Android" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Watch Android phone" }),
    );
    return screen.getByRole("button", {
      name: "Add preparation instructions to chat",
    });
  }
  function expectNoPromptSent() {
    expect(fixtures.sendMessage).not.toHaveBeenCalled();
    expect(fixtures.sendEncryptedMessage).not.toHaveBeenCalled();
    expect(fixtures.queueTurn).not.toHaveBeenCalled();
  }

  it("adds instructions only on click and preserves the latest draft, files and upload error", async () => {
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    const view = render(workbench(undefined, [attachment]));
    expectNoPromptSent();
    expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(
      "next prompt",
    );
    const fileInput = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(["new file"], "failed.txt", { type: "text/plain" })],
      },
    });
    await screen.findByText("Couldn’t attach files");
    const prepare = openPhone();
    expectNoPromptSent();
    expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(
      "next prompt",
    );
    const latestDraft = "  user notes\n\n";
    act(() => {
      useConsoleStore.getState().setComposerDraft("sess_1", latestDraft);
      useConsoleStore
        .getState()
        .setComposerDraft("another-session", "leave alone");
    });
    fireEvent.click(prepare);
    const expected = `${latestDraft}\n\n${MOBILE_PREPARATION_PROMPT}`;
    expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(expected);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue(
      expected,
    );
    expect(useConsoleStore.getState().composerDrafts["another-session"]).toBe(
      "leave alone",
    );
    expect(MOBILE_PREPARATION_PROMPT).toContain("/AGENTS.md");
    expect(MOBILE_PREPARATION_PROMPT).toContain("/docs/agent-preparation.md");
    expect(
      screen.getByRole("button", { name: "Remove private-notes.txt" }),
    ).toBeVisible();
    expect(screen.getByText("Couldn’t attach files")).toBeVisible();
    expectNoPromptSent();
  });

  it("fills an empty encrypted draft once even after repeated clicks without sending it", async () => {
    fixtures.session = {
      ...fixtures.session,
      runtime_status: "idle",
      transport: "e2ee",
    };
    useConsoleStore.setState({ composerDrafts: {} });
    render(workbench(undefined, [attachment]));
    const prepare = openPhone();
    expect(useConsoleStore.getState().composerDrafts.sess_1).toBeUndefined();
    fireEvent.click(prepare);
    fireEvent.click(prepare);
    await act(async () => {
      await expect(fixtures.preparePhone!()).resolves.toBe(true);
    });
    expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(
      MOBILE_PREPARATION_PROMPT,
    );
    expect(screen.getByDisplayValue(MOBILE_PREPARATION_PROMPT)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Remove private-notes.txt" }),
    ).toBeVisible();
    expectNoPromptSent();
  });

  it.each([
    { transport: "manager", running: true },
    { transport: "e2ee", running: true },
    { transport: "e2ee", loading: true },
    { transport: "e2ee", missingKey: true },
    { transport: "manager", offline: true },
  ] as const)(
    "allows draft insertion while ordinary sending is unavailable: %j",
    (condition) => {
      fixtures.session = {
        ...fixtures.session,
        runtime_status:
          "running" in condition && condition.running ? "running" : "idle",
        transport: condition.transport,
      };
      fixtures.keyLoading = Boolean(
        "loading" in condition && condition.loading,
      );
      fixtures.rootKeyAvailable = !(
        "missingKey" in condition && condition.missingKey
      );
      fixtures.nodeOnline = !("offline" in condition && condition.offline);
      render(workbench());
      const prepare = openPhone();
      expect(prepare).toBeEnabled();
      fireEvent.click(prepare);
      expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(
        `next prompt\n\n${MOBILE_PREPARATION_PROMPT}`,
      );
      if ("running" in condition && condition.running) {
        expect(
          screen.queryByRole("button", { name: "Send prompt" }),
        ).not.toBeInTheDocument();
      }
      expectNoPromptSent();
    },
  );

  it.each(["manager", "e2ee"] as const)(
    "sends the combined draft and staged attachments only when the user presses Send (%s)",
    async (transport) => {
      fixtures.session = {
        ...fixtures.session,
        runtime_status: "idle",
        transport,
      };
      fixtures.sendMessage.mockImplementation(async (_content, options) => {
        options.onAccepted();
        return { sessionId: "sess_1" };
      });
      render(workbench(undefined, [attachment]));
      fireEvent.click(openPhone());
      expectNoPromptSent();
      fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
      const expected = `next prompt\n\n${MOBILE_PREPARATION_PROMPT}`;
      if (transport === "e2ee") {
        await waitFor(() =>
          expect(fixtures.sendEncryptedMessage).toHaveBeenCalledWith(expected, [
            attachment,
          ]),
        );
        expect(fixtures.sendMessage).not.toHaveBeenCalled();
      } else {
        await waitFor(() =>
          expect(fixtures.sendMessage).toHaveBeenCalledWith(
            expected,
            expect.objectContaining({
              attachmentIds: [attachment.attachmentId],
              attachments: [attachment],
            }),
          ),
        );
        expect(fixtures.sendEncryptedMessage).not.toHaveBeenCalled();
      }
      await waitFor(() =>
        expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(""),
      );
      expect(
        screen.queryByRole("button", { name: "Remove private-notes.txt" }),
      ).not.toBeInTheDocument();
      expect(fixtures.queueTurn).not.toHaveBeenCalled();
    },
  );
});

describe("Codex subagent status in the session workbench", () => {
  function activity(
    activityKind: "started" | "completed",
    toolCallId: string,
    turnId: string,
    createdAt: string,
  ): SessionEvent[] {
    return normalizeTunnelFrame(
      {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "sess_1",
          update: {
            sessionUpdate: "tool_call",
            toolCallId,
            title: `${activityKind} subagent worker`,
            kind: "other",
            status: "in_progress",
            rawInput: {
              activityKind,
              agentThreadId: "child_1",
              agentPath: "/root/worker",
            },
          },
        },
      },
      { createdAt },
    ).map((event) => ({ ...event, turnId }));
  }

  it.each([
    { localStatus: "idle", mainLabel: "Ready for a prompt", mainText: "idle" },
    { localStatus: "done", mainLabel: "Run completed", mainText: "done" },
  ] as const)(
    "keeps a child active after its start tool completes while the main run is $mainText",
    ({ localStatus, mainLabel, mainText }) => {
      fixtures.session = { ...fixtures.session, runtime_status: "idle" };
      fixtures.localStatus = localStatus;
      const view = render(workbench());
      const mainBadges = screen.getAllByLabelText(mainLabel);
      expect(mainBadges.length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();

      fixtures.conversationEvents = mergeEvents([
        ...activity("started", "start_1", "turn_1", "2026-11-09T12:00:00Z"),
        ...normalizeTunnelFrame(
          {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "sess_1",
              update: {
                sessionUpdate: "tool_call_update",
                toolCallId: "start_1",
                status: "completed",
              },
            },
          },
          { createdAt: "2026-11-09T12:00:01Z" },
        ).map((event) => ({ ...event, turnId: "turn_1" })),
      ]);
      view.rerender(workbench());

      expect(screen.getByLabelText("1 sub agent active")).toHaveTextContent(
        /^1$/,
      );
      expect(screen.getAllByLabelText(mainLabel)).toHaveLength(
        mainBadges.length,
      );
      for (const badge of screen.getAllByLabelText(mainLabel)) {
        expect(badge).toHaveTextContent(mainText);
      }
      expect(
        screen.queryByLabelText("Agent is responding"),
      ).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "Queue after current turn" }),
      ).not.toBeInTheDocument();

      // A child completion can arrive in a later turn than the launch.
      fixtures.conversationEvents = mergeEvents([
        ...fixtures.conversationEvents,
        ...activity("completed", "finish_1", "turn_2", "2026-11-09T12:00:02Z"),
      ]);
      view.rerender(workbench());

      expect(
        screen.queryByLabelText("1 sub agent active"),
      ).not.toBeInTheDocument();
      expect(screen.getAllByLabelText(mainLabel)).toHaveLength(
        mainBadges.length,
      );
      for (const badge of screen.getAllByLabelText(mainLabel)) {
        expect(badge).toHaveTextContent(mainText);
      }
      expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
    },
  );

  it("restores compact child activity history without changing the idle main status", () => {
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    fixtures.history = [
      {
        message_id: "history_start_1",
        session_id: "sess_1",
        session_seq: 1,
        turn_id: "turn_1",
        message_type: "tool_call",
        created_at: "2026-11-09T12:00:00Z",
        has_detail: true,
        tool: {
          tool_call_id: "start_1",
          title: "Start subagent worker",
          status: "completed",
          codex_subagent: {
            thread_id: "child_1",
            activity_kind: "started",
            agent_path: "/root/worker",
          },
        },
      },
    ];
    render(workbench());

    expect(screen.getByLabelText("1 sub agent active")).toHaveTextContent(
      /^1$/,
    );
    expect(
      screen.getAllByLabelText("Ready for a prompt").length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByLabelText("Agent is responding"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
  });

  it("applies a late child completion even after its main turn has been calibrated into history", () => {
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    fixtures.calibratedTurnIds = ["turn_1"];
    fixtures.history = [
      {
        message_id: "history_start_1",
        session_id: "sess_1",
        session_seq: 1,
        turn_id: "turn_1",
        message_type: "tool_call",
        created_at: "2026-11-09T12:00:00Z",
        has_detail: true,
        tool: {
          tool_call_id: "start_1",
          title: "Start subagent worker",
          status: "completed",
          codex_subagent: {
            thread_id: "child_1",
            activity_kind: "started",
            agent_path: "/root/worker",
          },
        },
      },
      {
        message_id: "main_turn_done",
        session_id: "sess_1",
        session_seq: 2,
        turn_id: "turn_1",
        message_type: "turn_done",
        created_at: "2026-11-09T12:00:01Z",
      },
    ];
    const view = render(workbench());
    expect(screen.getByLabelText("1 sub agent active")).toBeInTheDocument();

    fixtures.conversationEvents = activity(
      "completed",
      "finish_1",
      "turn_1",
      "2026-11-09T12:00:02Z",
    );
    view.rerender(workbench());

    expect(
      screen.queryByLabelText("1 sub agent active"),
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByLabelText("Ready for a prompt").length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
  });

  it("refreshes late lifecycle history only while a child remains active", async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      fixtures.session = { ...fixtures.session, runtime_status: "idle" };
      const view = render(workbench());
      await act(async () => {
        vi.advanceTimersByTime(6_000);
      });
      expect(fixtures.refetchHistory).not.toHaveBeenCalled();

      fixtures.conversationEvents = activity(
        "started",
        "start_1",
        "turn_1",
        "2026-11-09T12:00:00Z",
      );
      view.rerender(workbench());
      await act(async () => {
        vi.advanceTimersByTime(3_000);
      });
      expect(fixtures.refetchHistory).toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
      expect(fixtures.observe).toHaveBeenLastCalledWith(
        expect.objectContaining({ enabled: false }),
      );

      fixtures.conversationEvents = mergeEvents([
        ...fixtures.conversationEvents,
        ...activity("completed", "finish_1", "turn_2", "2026-11-09T12:00:02Z"),
      ]);
      view.rerender(workbench());
      const refetchesAfterCompletion =
        fixtures.refetchHistory.mock.calls.length;
      await act(async () => {
        vi.advanceTimersByTime(6_000);
      });
      expect(fixtures.refetchHistory).toHaveBeenCalledTimes(
        refetchesAfterCompletion,
      );
      expect(
        screen.getAllByLabelText("Ready for a prompt").length,
      ).toBeGreaterThan(0);
    } finally {
      visibility.mockRestore();
      online.mockRestore();
      vi.useRealTimers();
    }
  });
});

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
    expect(fixtures.refetchHistory).toHaveBeenCalled();
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
  it("consumes search preauthorization after acceptance instead of applying it to the next turn", async () => {
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    const access = {
      queries: ["cicd"],
      agent_ids: ["agent_other"],
      session_ids: ["*"],
    };
    fixtures.sendMessage.mockImplementationOnce(async (_input, options) => {
      options?.onAccepted?.();
      return { sessionId: "sess_1" };
    });
    render(workbench(undefined, undefined, access));
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    await waitFor(() =>
      expect(fixtures.sendMessage).toHaveBeenCalledWith(
        "next prompt",
        expect.objectContaining({ searchAccess: access }),
      ),
    );
    await waitFor(() =>
      expect(useConsoleStore.getState().composerDrafts.sess_1).toBe(""),
    );
    act(() =>
      useConsoleStore.getState().setComposerDraft("sess_1", "second prompt"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    await waitFor(() =>
      expect(fixtures.sendMessage).toHaveBeenLastCalledWith(
        "second prompt",
        expect.objectContaining({ searchAccess: undefined }),
      ),
    );
  });

  it("retains search preauthorization when the prompt fails before acceptance", async () => {
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    const access = {
      queries: ["*"],
      agent_ids: ["self"],
      session_ids: ["sess_a"],
    };
    fixtures.sendMessage.mockRejectedValueOnce(new Error("not accepted"));
    render(workbench(undefined, undefined, access));
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    await screen.findByText(/not accepted/);
    fireEvent.click(screen.getByRole("button", { name: "Send prompt" }));
    await waitFor(() => expect(fixtures.sendMessage).toHaveBeenCalledTimes(2));
    expect(fixtures.sendMessage).toHaveBeenLastCalledWith(
      "next prompt",
      expect.objectContaining({ searchAccess: access }),
    );
  });

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
