/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { queryKeys } from "@/features/api/query-keys";
import type {
  AgentSession,
  HistoryMessage,
  SessionConfiguration,
  TurnSearchAccess,
} from "@/features/api/types";
import { ApiError, AuthError } from "@/features/api/errors";
import { useLocaleStore } from "@/features/i18n/locale-store";
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
  observerError: null as Error | null,
  agentType: "claude-code",
  encryptedStatus: "idle" as ConversationRunStatus,
  sendMessage: vi.fn().mockResolvedValue({ sessionId: "sess_1" }),
  sendEncryptedMessage: vi.fn().mockResolvedValue(undefined),
  queueTurn: vi.fn().mockResolvedValue(undefined),
  steerTurn: vi.fn().mockResolvedValue(undefined),
  observe: vi.fn(),
  readHostedStarter: vi.fn(),
  readHostedSandbox: vi.fn(),
  activateHostedAgent: vi.fn(),
  resumeHostedSandbox: vi.fn(),
  emptyEvents: [],
  knowledgeEnabled: false,
  disabledFeatures: [] as string[],
  readCapsules: vi.fn(),
  readInjections: vi.fn(),
  conversationEvents: [] as SessionEvent[],
  emptyQuery: { data: undefined, refetch: vi.fn() },
  history: [] as HistoryMessage[],
  configuration: undefined as SessionConfiguration | undefined,
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

vi.mock("@/features/flags", () => ({
  useFeature: (feature: string) =>
    feature === "knowledge_capsules"
      ? fixtures.knowledgeEnabled
      : !fixtures.disabledFeatures.includes(feature),
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
    data: { agents: [{ agent_id: "agent_1", agent_type: fixtures.agentType }] },
  }),
  useAgentSessions: () => fixtures.emptyQuery,
  useAgentPermissionCatalog: () => fixtures.emptyQuery,
  useSessionConfiguration: () => ({
    ...fixtures.emptyQuery,
    data: fixtures.configuration,
  }),
  useSessionHistory: () => ({
    ...fixtures.emptyQuery,
    refetch: fixtures.refetchHistory,
    isSuccess: !fixtures.historyError,
    error: fixtures.historyError,
    data: { pages: [{ messages: fixtures.history }] },
  }),
  listSessionHistory: fixtures.readHistory,
  useKnowledgeCapsules: (...args: unknown[]) => {
    fixtures.readCapsules(...args);
    return fixtures.emptyQuery;
  },
  useKnowledgeInjections: (...args: unknown[]) => {
    fixtures.readInjections(...args);
    return fixtures.emptyQuery;
  },
  useSessionArtifacts: () => fixtures.emptyQuery,
  useAgentOwnerInfos: () => fixtures.emptyQuery,
  getQueuedSessionTurn: vi.fn().mockResolvedValue(null),
  queueSessionTurn: fixtures.queueTurn,
  steerSessionTurn: fixtures.steerTurn,
  createUserAttachment: fixtures.createAttachment,
  readHostedStarter: fixtures.readHostedStarter,
  readHostedSandbox: fixtures.readHostedSandbox,
  activateHostedAgent: fixtures.activateHostedAgent,
  resumeHostedSandbox: fixtures.resumeHostedSandbox,
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
    return {
      events: fixtures.emptyEvents,
      error: fixtures.observerError,
      status: fixtures.observerError ? "error" : "observing",
    };
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
  SessionBrowserApprovals: () => <div data-testid="browser-approvals" />,
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
    model: undefined,
  };
  fixtures.knowledgeEnabled = false;
  fixtures.disabledFeatures = [];
  fixtures.readCapsules.mockClear();
  fixtures.readInjections.mockClear();
  fixtures.localStatus = "idle";
  fixtures.conversationError = null;
  fixtures.observerError = null;
  fixtures.agentType = "claude-code";
  fixtures.readHostedStarter.mockReset().mockResolvedValue({ enabled: false });
  fixtures.readHostedSandbox.mockReset().mockResolvedValue(null);
  fixtures.activateHostedAgent.mockReset();
  fixtures.resumeHostedSandbox.mockReset();
  fixtures.encryptedStatus = "idle";
  fixtures.conversationEvents = [];
  fixtures.history = [];
  fixtures.configuration = undefined;
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
  useLocaleStore.setState({ locale: "en" });
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

describe("sandbox model access in a session", () => {
  const access = {
    enabled: true,
    sandbox_model_access: {
      node_id: "node_1",
      harnesses: ["codex"],
      state: "available",
      agents: [{ agent_id: "agent_1", state: "failed" }],
    },
  };

  it("holds the draft while a saved Pax authorization is reconnecting", async () => {
    fixtures.agentType = "codex";
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    fixtures.nodeOnline = true;
    fixtures.readHostedSandbox.mockResolvedValue({
      sandbox: { node_id: "node_1", status: "ready", generation: 3 },
    });
    const grant = (state: "starting" | "ready") => ({
      ...access,
      sandbox_model_access: {
        ...access.sandbox_model_access,
        agents: [{ agent_id: "agent_1", enabled: true, state }],
      },
    });
    fixtures.readHostedStarter.mockResolvedValue(grant("starting"));
    render(workbench());

    await screen.findByText("Setting up free model access…");
    const button = screen.getByRole("button", { name: "Send prompt" });
    expect(button).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue(
      "next prompt",
    );
    expect(fixtures.sendMessage).not.toHaveBeenCalled();

    fixtures.readHostedStarter.mockResolvedValue(grant("ready"));
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.hostedStarter("user_1"),
      }),
    );
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByText("Setting up free model access…")).toBeNull();
    expect(screen.queryByText("Pax free quota is authorized.")).toBeNull();
    expect(screen.queryByText("Pax free quota is ready.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Disable Pax free quota" }),
    ).toBeNull();
  });

  it.each([true, false])(
    "clears the setup notice for a ready Pi grant even when new grants are unavailable (node online: %s)",
    async (online) => {
      fixtures.agentType = "pi";
      fixtures.nodeOnline = online;
      fixtures.readHostedSandbox.mockResolvedValue({
        sandbox: { node_id: "node_1", status: "ready", generation: 3 },
      });
      const grant = (state: "starting" | "ready") => ({
        ...access,
        sandbox_model_access: {
          ...access.sandbox_model_access,
          harnesses: [],
          agents: [{ agent_id: "agent_1", enabled: true, state }],
        },
      });
      fixtures.readHostedStarter.mockResolvedValue(grant("starting"));
      render(workbench());
      const waiting = "Waiting for the sandbox to set up free model access.";
      expect(await screen.findByText(waiting)).toBeVisible();

      fixtures.readHostedStarter.mockResolvedValue(grant("ready"));
      await act(() =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.hostedStarter("user_1"),
        }),
      );
      await waitFor(() => expect(screen.queryByText(waiting)).toBeNull());
      expect(screen.queryByText("Pax free quota is ready.")).toBeNull();
    },
  );

  it("resumes the existing sandbox and shows when authorized access is waiting", async () => {
    fixtures.agentType = "codex";
    fixtures.nodeOnline = false;
    fixtures.readHostedSandbox.mockResolvedValue({
      sandbox: { node_id: "node_1", status: "sleeping", generation: 2 },
    });
    const grant = {
      ...access,
      sandbox_model_access: {
        ...access.sandbox_model_access,
        harnesses: [],
        agents: [{ agent_id: "agent_1", enabled: true, state: "available" }],
      },
    };
    fixtures.readHostedStarter.mockResolvedValue(grant);
    fixtures.resumeHostedSandbox.mockImplementation(async () => {
      const queued = {
        sandbox: { node_id: "node_1", status: "queued", generation: 3 },
      };
      fixtures.readHostedSandbox.mockResolvedValue(queued);
      return queued;
    });
    render(workbench());
    expect(
      await screen.findByText(
        "Waiting for the sandbox to set up free model access.",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Pax free quota is authorized.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Disable Pax free quota" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Use Pax free quota" }),
    ).toBeNull();
    fireEvent.click(
      await screen.findByRole("button", { name: "Start sandbox" }),
    );
    await screen.findByText("Sandbox queued. Waiting for a host…");
    expect(fixtures.resumeHostedSandbox).toHaveBeenCalledExactlyOnceWith(
      "node_1",
    );
    expect(fixtures.sendMessage).not.toHaveBeenCalled();
    expect(fixtures.activateHostedAgent).not.toHaveBeenCalled();
  });

  it("offers free quota activation in the composer", async () => {
    fixtures.agentType = "codex";
    fixtures.readHostedStarter.mockResolvedValue({
      ...access,
      sandbox_model_access: {
        ...access.sandbox_model_access,
        agents: [{ agent_id: "agent_1", enabled: false, state: "available" }],
      },
    });
    fixtures.activateHostedAgent.mockResolvedValue({});
    render(workbench());

    const activate = await screen.findByRole("button", {
      name: "Use Pax free quota",
    });
    expect(fixtures.activateHostedAgent).not.toHaveBeenCalled();
    fireEvent.click(activate);
    await waitFor(() =>
      expect(fixtures.activateHostedAgent).toHaveBeenCalledExactlyOnceWith(
        "node_1",
        "agent_1",
      ),
    );
  });

  it("shows failure before sending, retries only on demand, and follows setup until ready", async () => {
    fixtures.agentType = "codex";
    fixtures.session = { ...fixtures.session, runtime_status: "idle" };
    fixtures.readHostedStarter.mockResolvedValue(access);
    fixtures.activateHostedAgent.mockImplementation(async () => {
      fixtures.readHostedStarter.mockResolvedValue({
        ...access,
        sandbox_model_access: {
          ...access.sandbox_model_access,
          agents: [{ agent_id: "agent_1", state: "starting" }],
        },
      });
      return {};
    });
    render(workbench());

    const retry = await screen.findByRole("button", {
      name: "Retry free model setup",
    });
    expect(
      screen.getByText("Couldn’t enable free model access."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send prompt" })).toBeEnabled();
    expect(fixtures.activateHostedAgent).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await screen.findByText("Setting up free model access…");
    expect(fixtures.activateHostedAgent).toHaveBeenCalledWith(
      "node_1",
      "agent_1",
    );

    fixtures.readHostedStarter.mockResolvedValue({
      ...access,
      sandbox_model_access: {
        ...access.sandbox_model_access,
        agents: [
          { agent_id: "agent_1", state: "ready" },
          { agent_id: "agent_2", state: "failed" },
        ],
      },
    });
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.hostedStarter("user_1"),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByText("Setting up free model access…")).toBeNull(),
    );
    expect(screen.queryByText("Pax free quota is ready.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Retry free model setup" }),
    ).toBeNull();
  });

  it("shows Claude Code setup failure while new activations are unavailable", async () => {
    fixtures.agentType = "claude-code";
    const grant = (harnesses: string[]) => ({
      ...access,
      sandbox_model_access: {
        ...access.sandbox_model_access,
        harnesses,
        agents: [{ agent_id: "agent_1", enabled: true, state: "failed" }],
      },
    });
    fixtures.readHostedStarter.mockResolvedValue(grant([]));
    render(workbench());
    expect(
      await screen.findByText("Couldn’t enable free model access."),
    ).toBeVisible();
    const retry = screen.getByRole("button", {
      name: "Retry free model setup",
    });
    expect(retry).toBeDisabled();
    expect(
      screen.queryByText(
        "Waiting for the sandbox to set up free model access.",
      ),
    ).toBeNull();

    fixtures.readHostedStarter.mockResolvedValue(grant(["claude-code"]));
    await act(() =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.hostedStarter("user_1"),
      }),
    );
    await waitFor(() => expect(retry).toBeEnabled());
    expect(fixtures.activateHostedAgent).not.toHaveBeenCalled();
  });

  it("does not show another node's sandbox failure", async () => {
    fixtures.agentType = "codex";
    fixtures.readHostedStarter.mockResolvedValue({
      ...access,
      sandbox_model_access: {
        ...access.sandbox_model_access,
        node_id: "other",
      },
    });
    render(workbench());
    await waitFor(() =>
      expect(
        queryClient.getQueryState(queryKeys.hostedStarter("user_1"))?.status,
      ).toBe("success"),
    );
    expect(
      screen.queryByRole("button", { name: "Retry free model setup" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Use Pax free quota" }),
    ).toBeNull();
  });

  it.each([
    [
      "lease_expired",
      "Free model access expired. Set it up again.",
      "免费模型访问已过期，请重新开通。",
    ],
    [
      "acp_probe_timeout",
      "The agent took too long to start a free model session.",
      "智能体启动免费模型会话超时。",
    ],
    [
      "acp_session_failed",
      "The agent could not start a free model session.",
      "智能体未能启动免费模型会话。",
    ],
  ])(
    "localizes model setup failure %s and offers a retry",
    async (reason, english, chinese) => {
      fixtures.agentType = "codex";
      fixtures.readHostedStarter.mockResolvedValue({
        ...access,
        sandbox_model_access: {
          ...access.sandbox_model_access,
          agents: [
            { agent_id: "agent_1", state: "failed", reason_code: reason },
          ],
        },
      });
      render(workbench());
      expect(await screen.findByText(english)).toBeVisible();
      expect(
        screen.getByRole("button", { name: "Retry free model setup" }),
      ).toBeEnabled();

      act(() => useLocaleStore.setState({ locale: "zh-CN" }));
      expect(screen.getByText(chinese)).toBeVisible();
      expect(
        screen.getByRole("button", { name: "重试开通免费模型" }),
      ).toBeEnabled();
    },
  );
});

it("shows the active observer's session error next to the composer", () => {
  fixtures.observerError = new Error("Could not reconnect to the turn");
  render(workbench());
  const notice = screen.getByRole("alert");
  expect(
    within(notice).getByText(/Could not reconnect to the turn/),
  ).toBeVisible();
  expect(notice.nextElementSibling).toBeNull();
  expect(notice.parentElement?.nextElementSibling?.tagName).toBe("FORM");
});

it("shows replayed retry feedback for the active turn until the agent resumes", () => {
  fixtures.agentType = "codex";
  fixtures.session = {
    ...fixtures.session,
    runtime_status: "running",
    runtime_turn_instance_id: "current_turn",
  };
  const replayedRetry = (turnId: string, sequence: number): HistoryMessage => ({
    message_id: `retry_${sequence}`,
    session_id: "sess_1",
    turn_id: turnId,
    session_seq: sequence,
    message_type: "session_info_update",
    raw_json: {
      method: "session/update",
      params: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "session_info_update",
          _meta: {
            codex: { error: { willRetry: true, message: "Internal detail" } },
          },
        },
      },
    },
  });
  fixtures.history = [replayedRetry("previous_turn", 1)];
  const view = render(workbench());
  expect(screen.queryByText("Agent is retrying…")).not.toBeInTheDocument();

  fixtures.history = [...fixtures.history, replayedRetry("current_turn", 2)];
  view.rerender(workbench());
  expect(screen.getByText("Agent is retrying…")).toBeVisible();
  expect(screen.queryByText("Internal detail")).not.toBeInTheDocument();

  fixtures.history = [
    ...fixtures.history,
    {
      message_id: "recovered_reply",
      session_id: "sess_1",
      turn_id: "current_turn",
      session_seq: 3,
      role: "assistant",
      message_type: "agent_message_chunk",
      parts: [{ id: 3, part_index: 0, part_type: "text", text: "Recovered" }],
    },
  ];
  view.rerender(workbench());
  expect(screen.queryByText("Agent is retrying…")).not.toBeInTheDocument();
  expect(screen.getByText("Recovered")).toBeVisible();
});

describe("thinking avatar follows the current session model", () => {
  const thought: SessionEvent = {
    type: "progress",
    id: "model-thought",
    sessionId: "sess_1",
    turnId: "model-turn",
    content: "Checking the code",
    streaming: true,
    sessionUpdate: "agent_thought_chunk",
    createdAt: "2026-11-13T20:00:00Z",
  };

  function configuration(model: string): SessionConfiguration {
    return {
      session_id: "sess_1",
      options: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          current_value: model,
          options: [
            { value: "deepseek-chat", name: "DeepSeek Chat" },
            { value: "gpt-6", name: "GPT-6" },
          ],
        },
      ],
      can_set: true,
      can_force_refresh: true,
    };
  }

  it("shows the whale for the current DeepSeek model even when stored metadata names GPT", () => {
    fixtures.session = { ...fixtures.session, model: "gpt-6" };
    fixtures.configuration = configuration("deepseek-chat");
    fixtures.conversationEvents = [thought];

    const { container } = render(workbench());

    expect(screen.getByText("Thinking…")).toBeVisible();
    expect(
      container.querySelector('[data-slot="thinking-avatar"]'),
    ).not.toHaveClass("animate-spin");
    expect(
      container
        .querySelector('[data-slot="thinking-avatar"]')
        ?.closest(".animate-spin"),
    ).toBeNull();
    expect(
      container.querySelector('[data-slot="thinking-spinner"]'),
    ).toHaveClass("animate-spin", "motion-reduce:animate-none");
  });

  it("updates the same completed timeline when the current model changes and retains its duration", () => {
    fixtures.configuration = configuration("deepseek-chat");
    const events: SessionEvent[] = [
      thought,
      {
        type: "turn_done",
        id: "model-turn-done",
        sessionId: "sess_1",
        turnId: "model-turn",
        createdAt: "2026-11-13T20:00:01Z",
      },
    ];
    fixtures.conversationEvents = events;
    const view = render(workbench());
    expect(screen.getByText("Thought for 1s")).toBeVisible();
    expect(
      view.container.querySelector('[data-slot="thinking-avatar"]'),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-slot="thinking-avatar"]'),
    ).not.toHaveClass("animate-spin");
    expect(
      view.container.querySelector('[data-slot="thinking-spinner"]'),
    ).not.toBeInTheDocument();

    for (const current of [configuration("gpt-6"), undefined]) {
      fixtures.configuration = current;
      view.rerender(workbench());

      expect(fixtures.conversationEvents).toBe(events);
      expect(screen.getByText("Thought for 1s")).toBeVisible();
      expect(
        view.container.querySelector('[data-slot="thinking-avatar"]'),
      ).not.toBeInTheDocument();
      expect(
        view.container.querySelector('[data-slot="thinking-spinner"]'),
      ).not.toBeInTheDocument();
    }

    fixtures.configuration = configuration("deepseek-chat");
    view.rerender(workbench());
    expect(
      view.container.querySelector('[data-slot="thinking-avatar"]'),
    ).toBeInTheDocument();
    expect(
      view.container.querySelector('[data-slot="thinking-spinner"]'),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Thought for 1s")).toBeVisible();
  });

  it.each(["gpt-6", undefined])(
    "does not use stored DeepSeek metadata when the current model is %s",
    (model) => {
      fixtures.session = { ...fixtures.session, model: "deepseek-chat" };
      fixtures.configuration = model ? configuration(model) : undefined;
      fixtures.conversationEvents = [thought];

      const { container } = render(workbench());

      expect(screen.getByText("Thinking…")).toBeVisible();
      expect(
        container.querySelector('[data-slot="thinking-avatar"]'),
      ).not.toBeInTheDocument();
      expect(
        container.querySelector('[data-slot="thinking-spinner"]'),
      ).not.toBeInTheDocument();
    },
  );
});

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
    expect(url.searchParams.get("harness")).toBe("claude-code");
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

describe("browser and Android control in a session", () => {
  const openPanel = () =>
    fireEvent.click(screen.getByRole("button", { name: "Open session panel" }));

  it("offers the browser and the phone, and listens for browser requests, when both features are enabled", () => {
    render(workbench());
    expect(screen.getByTestId("browser-approvals")).toBeInTheDocument();
    openPanel();
    expect(screen.getByRole("button", { name: "Browser" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Android" })).toBeVisible();
  });

  it("leaves out the browser panel and its requests when browser control is not enabled", () => {
    fixtures.disabledFeatures = ["browser_control"];
    render(workbench());
    expect(screen.queryByTestId("browser-approvals")).not.toBeInTheDocument();
    openPanel();
    expect(
      screen.queryByRole("button", { name: "Browser" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Android" })).toBeVisible();
  });

  it("leaves out the phone panel when Android control is not enabled", () => {
    fixtures.disabledFeatures = ["android_control"];
    render(workbench());
    openPanel();
    expect(
      screen.queryByRole("button", { name: "Android" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Browser" })).toBeVisible();
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

describe("runtime knowledge capsule visibility", () => {
  it("does not request knowledge or show its panel when the feature is disabled", () => {
    render(workbench());
    expect(fixtures.readCapsules).toHaveBeenCalledWith(undefined, {
      status: "active",
    });
    expect(fixtures.readInjections).toHaveBeenCalledWith(undefined, undefined);
    fireEvent.click(screen.getByRole("button", { name: "Open session panel" }));
    expect(
      screen.queryByRole("button", { name: "Knowledge" }),
    ).not.toBeInTheDocument();
  });

  it("requests and displays knowledge for an ordinary user with a feature grant", () => {
    fixtures.knowledgeEnabled = true;
    render(workbench());
    expect(fixtures.readCapsules).toHaveBeenCalledWith("user_1", {
      status: "active",
    });
    expect(fixtures.readInjections).toHaveBeenCalledWith("user_1", "sess_1");
    fireEvent.click(screen.getByRole("button", { name: "Open session panel" }));
    expect(
      screen.getByRole("button", { name: "Knowledge" }),
    ).toBeInTheDocument();
  });
});
