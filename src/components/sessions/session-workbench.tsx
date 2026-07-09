"use client";

import {
  FormEvent,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Circle,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Mic,
  PanelRight,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Send,
  X,
} from "lucide-react";
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
  updateAgentSession,
  useAgentOwnerInfos,
  useKnowledgeCapsules,
  useKnowledgeInjections,
  useAgentSessions,
  useNodeAgents,
  useNodes,
  useSessionHistory,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import {
  KnowledgeCapsule,
  SessionKnowledgeInjection,
  SessionApprovalMode,
  SessionPaxConfig,
  User,
} from "@/features/api/types";
import { filterLiveEventsAlreadyInHistory } from "@/features/runtime/filter-live-history-events";
import { normalizeHistoryMessages } from "@/features/runtime/normalize-history-message";
import { mergeEvents } from "@/features/runtime/merge-session-events";
import {
  groupWorkstreamEvents,
  SessionEvent,
} from "@/features/runtime/session-events";
import { useConversationRun } from "@/features/runtime/use-conversation-run";
import { compactId } from "@/lib/format";
import { cn } from "@/lib/utils";

type SessionWorkbenchProps = {
  user: User;
  sessionId: string;
  nodeId?: string;
  agentId?: string;
  initialApprovalMode?: SessionApprovalMode;
  initialCwd?: string;
  initialPrompt?: string;
  initialPromptKey?: string;
};

type SessionSidePanelId = "knowledge";

type SessionSidePanel = {
  id: SessionSidePanelId;
  label: string;
  description: string;
  icon: ReactNode;
  content: ReactNode;
};

export function SessionWorkbench({
  user,
  sessionId,
  nodeId,
  agentId,
  initialApprovalMode,
  initialCwd,
  initialPrompt,
  initialPromptKey,
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
  const sessionsQuery = useAgentSessions(
    user.user_id,
    activeNodeId,
    activeAgentId,
  );
  const [draft, setDraft] = useState("");
  const [newSessionCwd, setNewSessionCwd] = useState(initialCwd ?? "");
  const [newSessionWorkspaceOpen, setNewSessionWorkspaceOpen] =
    useState(Boolean(initialCwd));
  const [newSessionApprovalMode, setNewSessionApprovalMode] =
    useState<SessionApprovalMode>(initialApprovalMode ?? "manual");
  const [pendingSessionPaxConfig, setPendingSessionPaxConfig] =
    useState<SessionPaxConfig | null>(null);
  const pendingInitialPromptRef = useRef(
    readInitialPrompt(initialPrompt, initialPromptKey),
  );
  const initialPromptSentRef = useRef(false);
  const [sendError, setSendError] = useState<Error | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const timelineBottomRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [activeSidePanelId, setActiveSidePanelId] =
    useState<SessionSidePanelId | null>(null);
  const [permissionDecisions, setPermissionDecisions] = useState<
    Record<string, PermissionDecisionResult>
  >({});
  const routeSessionId = sessionId === "new" ? undefined : sessionId;
  const [currentSessionId, setCurrentSessionId] = useState(routeSessionId);
  const isNewSession = !currentSessionId;
  const normalizedNewSessionCwd = newSessionCwd.trim();
  const newSessionCwdInvalid =
    isNewSession &&
    normalizedNewSessionCwd.length > 0 &&
    !isAbsolutePath(normalizedNewSessionCwd);
  const activeSession = useMemo(
    () =>
      sessionsQuery.data?.sessions.find(
        (session) => session.session_id === currentSessionId,
      ),
    [currentSessionId, sessionsQuery.data?.sessions],
  );
  const activePaxConfig =
    activeSession?.pax_config ?? pendingSessionPaxConfig ?? undefined;
  const displayedApprovalMode =
    activePaxConfig?.approval_mode ?? newSessionApprovalMode;
  const displayedWorkspace =
    currentSessionId && activePaxConfig?.cwd
      ? activePaxConfig.cwd
      : currentSessionId
        ? "/tmp"
        : normalizedNewSessionCwd;
  const shouldShowReadOnlyWorkspace =
    Boolean(currentSessionId && displayedWorkspace) &&
    displayedWorkspace !== "/tmp";
  const sessionDisplayName =
    activeSession?.name?.trim() ||
    (currentSessionId ? compactId(currentSessionId) : "New session");
  const sessionTitleTooltip =
    activeSession?.name && currentSessionId
      ? `${activeSession.name} (${currentSessionId})`
      : (currentSessionId ?? "New session");
  const handleSessionAssigned = useCallback(
    (nextSessionId: string) => {
      setCurrentSessionId(nextSessionId);
      if (activeNodeId && activeAgentId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessions(
            user.user_id,
            activeNodeId,
            activeAgentId,
          ),
        });
      }
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
    [activeAgentId, activeNodeId, queryClient, user.user_id],
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
  const updateSessionApprovalMode = useMutation({
    mutationFn: async (approvalMode: SessionApprovalMode) => {
      if (!activeNodeId || !activeAgentId || !currentSessionId) {
        throw new Error("Start the session before changing approval mode.");
      }

      return updateAgentSession(
        user.user_id,
        activeNodeId,
        activeAgentId,
        currentSessionId,
        {
          pax_config: {
            approval_mode: approvalMode,
          },
        },
      );
    },
    onMutate: (approvalMode) => {
      setPendingSessionPaxConfig((current) => ({
        ...current,
        cwd: activePaxConfig?.cwd ?? current?.cwd,
        approval_mode: approvalMode,
      }));
    },
    onSuccess: (session) => {
      setPendingSessionPaxConfig(session.pax_config ?? null);
      if (activeNodeId && activeAgentId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessions(
            user.user_id,
            activeNodeId,
            activeAgentId,
          ),
        });
      }
    },
    onError: (caught) => {
      setSendError(caught instanceof Error ? caught : new Error(String(caught)));
    },
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
          source: "user",
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
    () => normalizeHistoryMessages(historyQuery.data?.messages ?? []),
    [historyQuery.data?.messages],
  );

  const liveEvents = useMemo(
    () =>
      filterLiveEventsAlreadyInHistory(conversationRun.events, historyEvents),
    [conversationRun.events, historyEvents],
  );
  const timeline = useMemo(
    () => mergeEvents([...historyEvents, ...liveEvents]),
    [historyEvents, liveEvents],
  );
  const invocationOwnerLookups = useMemo(
    () => agentOwnerLookupsFromInvocations(timeline),
    [timeline],
  );
  const agentOwnerInfosQuery = useAgentOwnerInfos(
    user.user_id,
    invocationOwnerLookups,
  );
  const workstreamItems = useMemo(
    () => groupWorkstreamEvents(timeline),
    [timeline],
  );
  const canSend =
    Boolean(activeAgentId && activeNodeId) &&
    conversationRun.status !== "streaming" &&
    conversationRun.status !== "waiting_approval" &&
    !newSessionCwdInvalid &&
    draft.trim().length > 0;
  const toggleApprovalMode = () => {
    const nextMode =
      displayedApprovalMode === "auto_approve_all"
        ? "manual"
        : "auto_approve_all";

    if (!currentSessionId) {
      setNewSessionApprovalMode(nextMode);
      return;
    }

    updateSessionApprovalMode.mutate(nextMode);
  };
  const updateTimelineStickiness = useCallback(() => {
    const scrollElement = timelineScrollRef.current;
    if (!scrollElement) {
      return;
    }

    const distanceFromBottom =
      scrollElement.scrollHeight -
      scrollElement.scrollTop -
      scrollElement.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 96;
  }, []);

  const submitDraft = useCallback(async () => {
    const content = draft.trim();
    if (
      !content ||
      !activeAgentId ||
      !activeNodeId ||
      newSessionCwdInvalid ||
      conversationRun.status === "streaming" ||
      conversationRun.status === "waiting_approval"
    ) {
      return;
    }

    setSendError(null);
    setDraft("");
    if (isNewSession) {
      setPendingSessionPaxConfig({
        cwd: normalizedNewSessionCwd || undefined,
        approval_mode: newSessionApprovalMode,
      });
    }
    try {
      await conversationRun.sendMessage(
        content,
        isNewSession
          ? {
              approvalMode: newSessionApprovalMode,
              cwd: normalizedNewSessionCwd || undefined,
            }
          : undefined,
      );
    } catch (caught) {
      if (isNewSession) {
        setPendingSessionPaxConfig(null);
      }
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    }
  }, [
    activeAgentId,
    activeNodeId,
    conversationRun,
    draft,
    isNewSession,
    newSessionApprovalMode,
    newSessionCwdInvalid,
    normalizedNewSessionCwd,
  ]);

  useEffect(() => {
    const content = pendingInitialPromptRef.current.trim();
    if (
      initialPromptSentRef.current ||
      sessionId !== "new" ||
      !content ||
      !activeAgentId ||
      !activeNodeId ||
      newSessionCwdInvalid ||
      conversationRun.status !== "idle"
    ) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      if (initialPromptSentRef.current) {
        return;
      }

      initialPromptSentRef.current = true;
      setSendError(null);
      setPendingSessionPaxConfig({
        cwd: normalizedNewSessionCwd || undefined,
        approval_mode: newSessionApprovalMode,
      });
      void conversationRun
        .sendMessage(content, {
          approvalMode: newSessionApprovalMode,
          cwd: normalizedNewSessionCwd || undefined,
        })
        .then(() => {
          removeStoredInitialPrompt(initialPromptKey);
        })
        .catch((caught) => {
          setPendingSessionPaxConfig(null);
          setSendError(
            caught instanceof Error ? caught : new Error(String(caught)),
          );
        });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    activeAgentId,
    activeNodeId,
    conversationRun,
    conversationRun.status,
    initialPromptKey,
    newSessionCwdInvalid,
    sessionId,
    newSessionApprovalMode,
    normalizedNewSessionCwd,
  ]);

  useLayoutEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }

    timelineBottomRef.current?.scrollIntoView({ block: "end" });
    shouldStickToBottomRef.current = true;
  }, [workstreamItems]);

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

  const sidePanels: SessionSidePanel[] = [
    {
      id: "knowledge",
      label: "Knowledge",
      description: "Capsules and system handoff injections",
      icon: <Brain className="h-4 w-4" />,
      content: (
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
      ),
    },
  ];
  const activeSidePanel = sidePanels.find(
    (panel) => panel.id === activeSidePanelId,
  );

  return (
    <ConsoleLayout
      activeAgent={activeAgent}
      activeNode={activeNode}
      nodes={nodes}
      user={user}
    >
      <div className="relative flex h-[calc(100vh-var(--topbar-h))] min-h-0 min-w-0 overflow-hidden bg-canvas">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
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
              <div className="mt-1 flex min-w-0 items-center gap-2">
                <TruncatedText
                  className="text-lg font-medium"
                  tooltip={sessionTitleTooltip}
                >
                  {sessionDisplayName}
                </TruncatedText>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <RunBadge status={conversationRun.status} />
              <Button
                icon={<PanelRight className="h-4 w-4" />}
                onClick={() =>
                  setActiveSidePanelId((current) =>
                    current ? null : (sidePanels[0]?.id ?? null),
                  )
                }
                size="icon"
                tooltip={
                  activeSidePanel ? "Hide context panel" : "Show context panel"
                }
                type="button"
                variant={activeSidePanel ? "secondary" : "ghost"}
              />
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-auto bg-canvas p-4"
            onScroll={updateTimelineStickiness}
            ref={timelineScrollRef}
          >
            <div className="mx-auto grid w-full max-w-4xl gap-4">
              <SessionErrors
                messagesError={historyQuery.error}
                missingRouteState={!activeNodeId || !activeAgentId}
                sendError={sendError ?? conversationRun.error}
              />
              {workstreamItems.map((item) => (
                <WorkstreamItemCard
                  agentOwnerInfos={agentOwnerInfosQuery.data ?? {}}
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
              <div
                aria-hidden="true"
                className="h-2"
                ref={timelineBottomRef}
              />
            </div>
          </div>

          <form
            className="relative z-10 border-t border-hairline bg-surface-1 p-3"
            onSubmit={handleSubmit}
          >
            <div className="mx-auto w-full max-w-4xl rounded-[22px] border border-hairline bg-surface-2 px-3 py-2 shadow-lg shadow-black/20">
              <textarea
                className="max-h-40 min-h-20 w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-ink outline-none placeholder:text-ink-tertiary"
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
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  icon={<Plus className="h-4 w-4" />}
                  size="icon"
                  tooltip="Add attachment"
                  type="button"
                  variant="ghost"
                />
                {isNewSession ? (
                  <>
                    {newSessionWorkspaceOpen ? (
                      <label
                        className={cn(
                          "inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border bg-canvas px-2.5 text-sm transition sm:max-w-80",
                          newSessionCwdInvalid
                            ? "border-warning text-warning"
                            : "border-hairline text-ink-muted focus-within:border-primary-focus focus-within:ring-2 focus-within:ring-primary-focus/20",
                        )}
                        onBlur={(event) => {
                          const nextTarget = event.relatedTarget;
                          if (
                            (nextTarget instanceof globalThis.Node &&
                              event.currentTarget.contains(nextTarget)) ||
                            newSessionCwd.trim()
                          ) {
                            return;
                          }

                          setNewSessionWorkspaceOpen(false);
                        }}
                      >
                        <FolderOpen className="h-4 w-4 shrink-0" />
                        <span className="shrink-0 text-xs font-medium text-ink-tertiary">
                          Workspace
                        </span>
                        <input
                          aria-invalid={newSessionCwdInvalid}
                          aria-label="Workspace"
                          autoFocus
                          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-ink outline-none placeholder:text-ink-tertiary"
                          onChange={(event) =>
                            setNewSessionCwd(event.target.value)
                          }
                          placeholder="/Users/me/project"
                          spellCheck={false}
                          value={newSessionCwd}
                        />
                      </label>
                    ) : (
                      <Button
                        icon={<FolderPlus className="h-4 w-4" />}
                        onClick={() => setNewSessionWorkspaceOpen(true)}
                        size="icon"
                        tooltip="Set workspace"
                        type="button"
                        variant="ghost"
                      />
                    )}
                  </>
                ) : shouldShowReadOnlyWorkspace ? (
                  <div className="inline-flex min-h-9 min-w-0 max-w-64 items-center gap-2 rounded-lg border border-hairline bg-canvas px-2.5 text-sm text-ink-muted">
                    <FolderOpen className="h-4 w-4 shrink-0" />
                    <span className="shrink-0 text-xs font-medium text-ink-tertiary">
                      Workspace
                    </span>
                    <span className="min-w-0 truncate font-mono text-xs text-ink">
                      {displayedWorkspace}
                    </span>
                  </div>
                ) : null}
                <button
                  aria-pressed={displayedApprovalMode === "auto_approve_all"}
                  className={cn(
                    "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-60",
                    displayedApprovalMode === "auto_approve_all"
                      ? "bg-success/10 text-success"
                      : "text-primary-hover hover:bg-surface-3",
                  )}
                  disabled={updateSessionApprovalMode.isPending}
                  onClick={toggleApprovalMode}
                  type="button"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {displayedApprovalMode === "auto_approve_all"
                      ? "Auto approve"
                      : "Manual approve"}
                  </span>
                </button>
                <div className="min-w-0 flex-1" />
                <Button
                  disabled
                  icon={<Mic className="h-4 w-4" />}
                  size="icon"
                  tooltip="Voice input is not available yet"
                  type="button"
                  variant="ghost"
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
            </div>
          </form>
        </section>

        {activeSidePanel && (
          <aside className="absolute inset-y-0 right-0 z-20 min-h-0 w-[min(100vw,320px)] overflow-auto border-l border-hairline bg-surface-1 shadow-2xl shadow-black/40 lg:relative lg:inset-auto lg:z-auto lg:w-[300px] lg:shadow-none">
            <div className="flex min-w-0 items-start justify-between gap-3 border-b border-hairline p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-ink">
                  {activeSidePanel.icon}
                  {activeSidePanel.label}
                </div>
                <div className="mt-1 text-xs text-ink-tertiary">
                  {activeSidePanel.description}
                </div>
              </div>
              <Button
                icon={<X className="h-4 w-4" />}
                onClick={() => setActiveSidePanelId(null)}
                size="icon"
                tooltip={`Hide ${activeSidePanel.label}`}
                type="button"
                variant="ghost"
              />
            </div>
            <div className="p-4">{activeSidePanel.content}</div>
          </aside>
        )}
      </div>
    </ConsoleLayout>
  );
}

function readInitialPrompt(initialPrompt?: string, initialPromptKey?: string) {
  if (initialPrompt) {
    return initialPrompt;
  }

  if (!initialPromptKey || typeof window === "undefined") {
    return "";
  }

  try {
    return window.sessionStorage.getItem(initialPromptKey) ?? "";
  } catch {
    return "";
  }
}

function isAbsolutePath(path: string) {
  return path.startsWith("/");
}

function removeStoredInitialPrompt(initialPromptKey?: string) {
  if (!initialPromptKey || typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(initialPromptKey);
  } catch {
    // Ignore storage cleanup failures; the prompt has already been sent.
  }
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

function RunBadge({
  status,
}: {
  status: "idle" | "streaming" | "waiting_approval" | "done" | "error";
}) {
  const statusConfig = {
    idle: {
      icon: <Circle className="h-3.5 w-3.5" />,
      label: "idle",
      tone: "neutral" as const,
      tooltip: "Ready for a prompt",
    },
    streaming: {
      icon: <LoaderCircle className="h-3.5 w-3.5 animate-spin" />,
      label: "running",
      tone: "warning" as const,
      tooltip: "Agent is responding",
    },
    waiting_approval: {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      label: "approval",
      tone: "warning" as const,
      tooltip: "Waiting for approval",
    },
    done: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: "done",
      tone: "success" as const,
      tooltip: "Run completed",
    },
    error: {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      label: "error",
      tone: "danger" as const,
      tooltip: "Run failed",
    },
  }[status];

  return (
    <Badge
      className="max-w-40 px-2 py-1 font-medium"
      tone={statusConfig.tone}
      tooltip={statusConfig.tooltip}
    >
      {statusConfig.icon}
      {statusConfig.label}
    </Badge>
  );
}

function agentOwnerLookupsFromInvocations(events: SessionEvent[]) {
  const lookups = new Map<
    string,
    { agentId?: string; representativeAgentId?: string }
  >();
  for (const event of events) {
    if (event.type !== "invocation") {
      continue;
    }

    for (const endpoint of [event.sender, event.receiver]) {
      if (!endpoint?.agentId && !endpoint?.representativeAgentId) {
        continue;
      }

      const key = endpoint.representativeAgentId
        ? `rep:${endpoint.representativeAgentId}`
        : `agent:${endpoint.agentId}`;
      lookups.set(key, {
        agentId: endpoint.agentId,
        representativeAgentId: endpoint.representativeAgentId,
      });
    }
  }

  return [...lookups.values()];
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
