"use client";

import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Brain, Radio, Send } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  PermissionDecisionOption,
  PermissionDecisionResult,
  WorkstreamItemCard,
} from "@/components/sessions/session-event-cards";
import {
  createKnowledgeCapsule,
  decideApproval,
  injectKnowledgeCapsule,
  useKnowledgeCapsules,
  useKnowledgeInjections,
  useNodeAgents,
  useNodes,
  useSessionHistory,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import {
  KnowledgeCapsule,
  SessionKnowledgeInjection,
  User,
} from "@/features/api/types";
import { normalizeHistoryMessage } from "@/features/runtime/normalize-history-message";
import { mergeEvents } from "@/features/runtime/merge-session-events";
import {
  groupWorkstreamEvents,
  SessionEvent,
} from "@/features/runtime/session-events";
import { useConversationRun } from "@/features/runtime/use-conversation-run";
import { compactId } from "@/lib/format";

type SessionWorkbenchProps = {
  user: User;
  sessionId: string;
  nodeId?: string;
  agentId?: string;
};

export function SessionWorkbench({
  user,
  sessionId,
  nodeId,
  agentId,
}: SessionWorkbenchProps) {
  const queryClient = useQueryClient();
  const nodesQuery = useNodes(user.user_id);
  const nodes = nodesQuery.data?.nodes ?? [];
  const activeNodeId = nodeId ?? nodes[0]?.node_id;
  const activeNode =
    nodes.find((node) => node.node_id === activeNodeId) ?? nodes[0];
  const agentsQuery = useNodeAgents(user.user_id, activeNodeId);
  const agents = agentsQuery.data?.agents ?? [];
  const activeAgentId = agentId ?? agents[0]?.agent_id;
  const activeAgent = agents.find((agent) => agent.agent_id === activeAgentId);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<Error | null>(null);
  const [permissionDecisions, setPermissionDecisions] = useState<
    Record<string, PermissionDecisionResult>
  >({});
  const routeSessionId = sessionId === "new" ? undefined : sessionId;
  const [currentSessionId, setCurrentSessionId] = useState(routeSessionId);
  const handleSessionAssigned = useCallback(
    (nextSessionId: string) => {
      setCurrentSessionId(nextSessionId);
      const params = new URLSearchParams();
      if (activeNodeId) {
        params.set("nodeId", activeNodeId);
      }
      if (activeAgentId) {
        params.set("agentId", activeAgentId);
      }
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        query
          ? `/sessions/${nextSessionId}?${query}`
          : `/sessions/${nextSessionId}`,
      );
    },
    [activeAgentId, activeNodeId],
  );
  const historyQuery = useSessionHistory(
    user.user_id,
    activeAgentId,
    currentSessionId,
  );
  const capsulesQuery = useKnowledgeCapsules(user.user_id, {
    status: "active",
  });
  const injectionsQuery = useKnowledgeInjections(
    user.user_id,
    currentSessionId,
  );
  const [capsuleKeyword, setCapsuleKeyword] = useState("");
  const [selectedCapsuleId, setSelectedCapsuleId] = useState("");
  const activeCapsules = capsulesQuery.data?.capsules ?? [];
  const selectedInjectionCapsuleId =
    selectedCapsuleId || activeCapsules[0]?.capsule_id || "";
  const refreshKnowledge = () => {
    if (!currentSessionId) {
      return;
    }

    void queryClient.invalidateQueries({
      queryKey: ["users", user.user_id, "knowledge-capsules"],
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.sessionKnowledgeInjections(
        user.user_id,
        currentSessionId,
      ),
    });
    if (activeAgentId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessionHistory(
          user.user_id,
          activeAgentId,
          currentSessionId,
        ),
      });
    }
  };
  const createCapsule = useMutation({
    mutationFn: () => {
      if (!currentSessionId) {
        throw new Error("Start the session before creating a capsule.");
      }

      return createKnowledgeCapsule(
        user.user_id,
        currentSessionId,
        capsuleKeyword.trim(),
      );
    },
    onSuccess: () => {
      setCapsuleKeyword("");
      refreshKnowledge();
    },
  });
  const injectCapsule = useMutation({
    mutationFn: () => {
      if (!currentSessionId) {
        throw new Error("Start the session before injecting a capsule.");
      }

      return injectKnowledgeCapsule(
        user.user_id,
        currentSessionId,
        selectedInjectionCapsuleId,
      );
    },
    onSuccess: refreshKnowledge,
  });
  const conversationRun = useConversationRun({
    agentId: activeAgentId,
    nodeId: activeNodeId,
    onSession: handleSessionAssigned,
    sessionId: routeSessionId,
    userId: user.user_id,
  });
  const decidePermission = useMutation({
    mutationFn: async ({
      approvalId,
      decisionOption,
    }: {
      approvalId: string;
      decisionOption: PermissionDecisionOption;
    }) => {
      await decideApproval(user.user_id, approvalId, decisionOption);
      setPermissionDecisions((current) => ({
        ...current,
        [approvalId]: {
          decisionOption,
          status: decisionOption === "deny" ? "denied" : "approved",
        },
      }));
      return conversationRun.resumePermission(approvalId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals(user.user_id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvalGrants(user.user_id),
      });
      if (activeAgentId && currentSessionId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessionHistory(
            user.user_id,
            activeAgentId,
            currentSessionId,
          ),
        });
      }
    },
  });

  // The timeline merges durable REST history with live conversation events.
  // REST gives refresh/resume safety; the run stream gives low-latency updates.
  const historyEvents = useMemo(
    () =>
      (historyQuery.data?.messages ?? []).flatMap((message) =>
        normalizeHistoryMessage(message),
      ),
    [historyQuery.data?.messages],
  );

  const liveEvents = useMemo(
    () => filterLiveEventsAlreadyInHistory(
      conversationRun.events,
      historyEvents,
    ),
    [conversationRun.events, historyEvents],
  );
  const timeline = useMemo(
    () => mergeEvents([...historyEvents, ...liveEvents]),
    [historyEvents, liveEvents],
  );
  const workstreamItems = useMemo(
    () => groupWorkstreamEvents(timeline),
    [timeline],
  );
  const canSend =
    Boolean(activeAgentId && activeNodeId) &&
    conversationRun.status !== "streaming" &&
    conversationRun.status !== "waiting_approval" &&
    draft.trim().length > 0;

  const submitDraft = useCallback(async () => {
    const content = draft.trim();
    if (
      !content ||
      !activeAgentId ||
      !activeNodeId ||
      conversationRun.status === "streaming" ||
      conversationRun.status === "waiting_approval"
    ) {
      return;
    }

    setSendError(null);
    setDraft("");
    try {
      await conversationRun.sendMessage(content);
    } catch (caught) {
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    }
  }, [activeAgentId, activeNodeId, conversationRun, draft]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitDraft();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    ) {
      return;
    }

    event.preventDefault();
    void submitDraft();
  }

  return (
    <ConsoleLayout
      activeAgent={activeAgent}
      activeNode={activeNode}
      nodes={nodes}
      user={user}
    >
      <div className="grid h-[calc(100vh-var(--topbar-h))] min-h-0 min-w-0 overflow-hidden lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 min-w-0 overflow-auto border-b border-hairline bg-surface-1 lg:border-b-0 lg:border-r">
          <div className="border-b border-hairline p-4">
            <Link
              className="inline-flex items-center gap-2 text-sm text-ink-subtle hover:text-ink"
              href="/"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to fleet
            </Link>
            <TruncatedText
              className="mt-4 text-xl font-medium"
              tooltip={currentSessionId ?? "New session"}
            >
              {currentSessionId ? compactId(currentSessionId) : "New session"}
            </TruncatedText>
            <MonoId
              className="mt-2"
              tooltip={activeAgentId ?? "No agent selected"}
            >
              {activeAgentId ? compactId(activeAgentId) : "No agent selected"}
            </MonoId>
          </div>

          <div className="grid gap-0 p-4">
            <ContextRow
              label="Node"
              value={activeNode?.name ?? activeNode?.hostname ?? "unknown"}
            />
            <ContextRow
              label="Agent"
              value={activeAgent?.name ?? activeAgent?.agent_type ?? "unknown"}
            />
            <ContextRow
              label="Session"
              value={currentSessionId ? compactId(currentSessionId) : "pending"}
            />
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-canvas">
          <div className="flex items-center justify-between gap-4 border-b border-hairline bg-surface-1 px-4 py-3">
            <div className="min-w-0">
              <div className="flex min-w-0 max-w-[52vw] gap-1 text-sm text-ink-tertiary">
                <TruncatedText>
                  {activeNode?.name ?? activeNode?.hostname ?? "Unknown node"}
                </TruncatedText>
                <span className="shrink-0">/</span>
                <TruncatedText>
                  {activeAgent?.name ?? activeAgentId ?? "Unknown agent"}
                </TruncatedText>
              </div>
              <div className="mt-1 text-lg font-medium">Workstream</div>
            </div>
            <RunBadge status={conversationRun.status} />
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4">
            <div className="mx-auto grid w-full max-w-4xl gap-4">
              <SessionErrors
                messagesError={historyQuery.error}
                missingRouteState={!activeNodeId || !activeAgentId}
                sendError={sendError ?? conversationRun.error}
              />
              {workstreamItems.map((item) => (
                <WorkstreamItemCard
                  item={item}
                  key={item.id}
                  permissionDecision={{
                    decisions: permissionDecisions,
                    error: decidePermission.error,
                    pendingApprovalId: decidePermission.variables?.approvalId,
                    pending: decidePermission.isPending,
                    onDecision: (approvalId, decisionOption) =>
                      decidePermission.mutate({
                        approvalId,
                        decisionOption,
                      }),
                  }}
                />
              ))}
              {!historyQuery.isLoading && workstreamItems.length === 0 && (
                <div className="rounded-lg border border-dashed border-hairline bg-surface-1 p-4 text-sm text-ink-tertiary">
                  No messages yet. Live tunnel events will appear here.
                </div>
              )}
            </div>
          </div>

          <form
            className="border-t border-hairline bg-surface-1 p-3"
            onSubmit={handleSubmit}
          >
            <div className="mx-auto flex w-full max-w-4xl items-end gap-3">
              <textarea
                className="min-h-20 flex-1 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none transition focus:border-primary-focus focus:ring-2 focus:ring-primary-focus/20"
                disabled={!activeAgentId}
                onKeyDown={handleComposerKeyDown}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  activeAgentId
                    ? "Send a prompt to this agent"
                    : "Select an agent before sending a prompt"
                }
                value={draft}
              />
              <Button
                disabled={!canSend}
                icon={<Send className="h-4 w-4" />}
                size="icon"
                tooltip="Send prompt"
                type="submit"
                variant="primary"
              />
            </div>
          </form>
        </section>

        <aside className="min-h-0 min-w-0 overflow-auto border-t border-hairline bg-surface-1 lg:border-l lg:border-t-0">
          <div className="border-b border-hairline p-4">
            <div className="text-sm font-medium text-ink">Evidence</div>
            <div className="mt-1 text-xs text-ink-tertiary">
              REST history and conversation run state
            </div>
          </div>
          <div className="grid gap-0 p-4">
            <StatusRow label="REST history" value={queryState(historyQuery)} />
            <StatusRow
              label="Conversation run"
              value={conversationRun.status}
            />
            <StatusRow
              label="Endpoint"
              value={
                activeAgentId && activeNodeId
                  ? `/api/v1/user/${user.user_id}/nodes/${activeNodeId}/agents/${activeAgentId}/conversation`
                  : "waiting for agent"
              }
            />
            <StatusRow
              label="Timeline events"
              value={String(timeline.length)}
            />
          </div>
          <div className="border-t border-hairline p-4">
            <KnowledgeTools
              capsules={activeCapsules}
              capsuleKeyword={capsuleKeyword}
              createError={createCapsule.error}
              createPending={createCapsule.isPending}
              injectError={injectCapsule.error}
              injectPending={injectCapsule.isPending}
              injections={injectionsQuery.data?.injections ?? []}
              injectionsLoading={injectionsQuery.isLoading}
              onCreate={() => createCapsule.mutate()}
              onInject={() => injectCapsule.mutate()}
              onKeywordChange={setCapsuleKeyword}
              onSelectedCapsuleChange={setSelectedCapsuleId}
              selectedCapsuleId={selectedInjectionCapsuleId}
            />
          </div>
        </aside>
      </div>
    </ConsoleLayout>
  );
}

function KnowledgeTools({
  capsules,
  capsuleKeyword,
  createError,
  createPending,
  injectError,
  injectPending,
  injections,
  injectionsLoading,
  onCreate,
  onInject,
  onKeywordChange,
  onSelectedCapsuleChange,
  selectedCapsuleId,
}: {
  capsules: KnowledgeCapsule[];
  capsuleKeyword: string;
  createError: Error | null;
  createPending: boolean;
  injectError: Error | null;
  injectPending: boolean;
  injections: SessionKnowledgeInjection[];
  injectionsLoading: boolean;
  onCreate: () => void;
  onInject: () => void;
  onKeywordChange: (value: string) => void;
  onSelectedCapsuleChange: (capsuleId: string) => void;
  selectedCapsuleId: string;
}) {
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (capsuleKeyword.trim()) {
      onCreate();
    }
  }

  function inject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedCapsuleId) {
      onInject();
    }
  }

  return (
    <div className="grid gap-4">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-ink">
          <Brain className="h-4 w-4" />
          Knowledge
        </div>
        <div className="mt-1 text-xs text-ink-tertiary">
          Capsules and system handoff injections
        </div>
      </div>

      <form className="grid gap-2" onSubmit={create}>
        <input
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => onKeywordChange(event.target.value)}
          placeholder="Keyword for capsule"
          value={capsuleKeyword}
        />
        <Button
          disabled={createPending || !capsuleKeyword.trim()}
          type="submit"
          variant="primary"
        >
          Create capsule
        </Button>
        {createError && <InlineError error={createError} />}
      </form>

      <form className="grid gap-2" onSubmit={inject}>
        <select
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => onSelectedCapsuleChange(event.target.value)}
          value={selectedCapsuleId}
        >
          {capsules.map((capsule) => (
            <option key={capsule.capsule_id} value={capsule.capsule_id}>
              {capsule.title || capsule.keyword}
            </option>
          ))}
        </select>
        <Button disabled={injectPending || !selectedCapsuleId} type="submit">
          Inject capsule
        </Button>
        {injectError && <InlineError error={injectError} />}
      </form>

      <section className="grid gap-2">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <TruncatedText className="text-sm font-medium">
            Injections
          </TruncatedText>
          <Badge className="font-mono">{String(injections.length)}</Badge>
        </div>
        {injectionsLoading && (
          <div className="text-xs text-ink-tertiary">Loading injections</div>
        )}
        {injections.map((injection) => (
          <div
            className="grid gap-1 rounded-lg border border-hairline bg-canvas p-2"
            key={injection.injection_id}
          >
            <div className="flex min-w-0 items-center justify-between gap-2">
              <MonoId tooltip={injection.capsule_id}>
                {compactId(injection.capsule_id)}
              </MonoId>
              <Badge>{injection.status}</Badge>
            </div>
            <MonoId tooltip={injection.delivery_message_id ?? "pending"}>
              {injection.delivery_message_id
                ? compactId(injection.delivery_message_id)
                : "pending delivery"}
            </MonoId>
          </div>
        ))}
        {!injectionsLoading && injections.length === 0 && (
          <div className="rounded-lg border border-dashed border-hairline bg-canvas p-2 text-xs text-ink-tertiary">
            No injections for this session
          </div>
        )}
      </section>
    </div>
  );
}

function RunBadge({ status }: { status: string }) {
  return (
    <Badge className="max-w-36" tooltip={status}>
      <Radio className="h-3.5 w-3.5" />
      {status}
    </Badge>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-hairline py-3 last:border-b-0">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <MonoId className="mt-1 text-ink-muted" tooltip={value}>
        {value.includes("/agents/") ||
        value.startsWith("agent_") ||
        value.startsWith("sess_")
          ? compactId(value, 18, 10)
          : value}
      </MonoId>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-hairline py-3 last:border-b-0">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <TruncatedText className="mt-1 text-sm text-ink-muted" tooltip={value}>
        {value}
      </TruncatedText>
    </div>
  );
}

function filterLiveEventsAlreadyInHistory(
  liveEvents: SessionEvent[],
  historyEvents: SessionEvent[],
) {
  const historyTextKeys = new Set(
    historyEvents.map(textEventKey).filter((key): key is string => Boolean(key)),
  );
  if (historyTextKeys.size === 0) {
    return liveEvents;
  }

  return liveEvents.filter((event) => {
    const key = textEventKey(event);
    return !key || !historyTextKeys.has(key);
  });
}

function textEventKey(event: SessionEvent) {
  if (
    event.type !== "user_message" &&
    event.type !== "agent_message" &&
    event.type !== "progress"
  ) {
    return undefined;
  }

  return `${event.type}:${event.sessionId}:${normalizeTimelineText(event.content)}`;
}

function normalizeTimelineText(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function SessionErrors({
  messagesError,
  missingRouteState,
  sendError,
}: {
  messagesError: Error | null;
  missingRouteState: boolean;
  sendError: Error | null;
}) {
  if (!messagesError && !missingRouteState && !sendError) {
    return null;
  }

  const error = messagesError ?? sendError;

  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-3 text-sm text-ink-muted">
      <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
      <div className="min-w-0">
        <div className="font-medium text-ink">Session connection notice</div>
        <TruncatedText className="mt-1 font-mono text-xs text-ink-tertiary">
          {missingRouteState
            ? "Missing nodeId or agentId. Open a session from the fleet overview to connect both REST and WebSocket."
            : `${error?.name}: ${error?.message}`}
        </TruncatedText>
      </div>
    </div>
  );
}

function InlineError({ error }: { error: Error }) {
  return (
    <TruncatedText className="text-xs text-warning">
      {error.name}: {error.message}
    </TruncatedText>
  );
}

function queryState(query: { isLoading: boolean; isError: boolean }) {
  if (query.isLoading) {
    return "loading";
  }

  if (query.isError) {
    return "error";
  }

  return "loaded";
}
