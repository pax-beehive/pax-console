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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Brain,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  FolderOpen,
  FolderPlus,
  LoaderCircle,
  Menu,
  Mic,
  PanelRight,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Square,
  Trash2,
  UploadCloud,
  Wrench,
  X,
} from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  PermissionDecisionOption,
  PermissionDecisionResult,
  ToolEvidencePanel,
  ToolEvidenceSelection,
  WorkstreamItemCard,
} from "@/components/sessions/session-event-cards";
import {
  artifactContentDownloadHref,
  completeArtifactUpload,
  createKnowledgeCapsule,
  createArtifactUpload,
  decideApproval,
  deleteQueuedSessionTurn,
  getArtifactContentURL,
  getQueuedSessionTurn,
  injectKnowledgeCapsule,
  queueSessionTurn,
  steerSessionTurn,
  stopSessionTurn,
  updateAgentSession,
  updateQueuedSessionTurn,
  useAgentOwnerInfos,
  useKnowledgeCapsules,
  useKnowledgeInjections,
  useAgentSessions,
  useNodeAgents,
  useNodes,
  useSessionHistory,
  useSessionArtifacts,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import {
  KnowledgeCapsule,
  SessionKnowledgeInjection,
  SessionApprovalMode,
  SessionPaxConfig,
  SessionArtifact,
  HistoryMessage,
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
import { useSessionObserver } from "@/features/runtime/session-observer";
import { compactId } from "@/lib/format";
import { cn } from "@/lib/utils";

type SessionWorkbenchProps = {
  user: User;
  sessionId: string;
  nodeId?: string;
  agentId?: string;
  embedded?: boolean;
  initialApprovalMode?: SessionApprovalMode;
  initialCwd?: string;
  initialPrompt?: string;
  initialPromptKey?: string;
  mobileBackLabel?: string;
  mobileMenuLabel?: string;
  onSessionAssigned?: (sessionId: string) => void;
  onMobileBack?: () => void;
  onMobileMenu?: () => void;
};

type SessionSidePanelId = "tool" | "artifacts" | "knowledge";

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
  embedded = false,
  initialApprovalMode,
  initialCwd,
  initialPrompt,
  initialPromptKey,
  mobileBackLabel,
  mobileMenuLabel,
  onSessionAssigned,
  onMobileBack,
  onMobileMenu,
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
  const [queuedFollowUpSessionId, setQueuedFollowUpSessionId] = useState<
    string | null
  >(null);
  const [queuedTurnEditingId, setQueuedTurnEditingId] = useState<string | null>(
    null,
  );
  const [queuedTurnDraft, setQueuedTurnDraft] = useState("");
  const [newSessionCwd, setNewSessionCwd] = useState(initialCwd ?? "");
  const [newSessionWorkspaceOpen, setNewSessionWorkspaceOpen] = useState(
    Boolean(initialCwd),
  );
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
  const [selectedToolEvidence, setSelectedToolEvidence] =
    useState<ToolEvidenceSelection | null>(null);
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
      if (onSessionAssigned) {
        onSessionAssigned(nextSessionId);
        return;
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
    [activeAgentId, activeNodeId, onSessionAssigned, queryClient, user.user_id],
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
  const artifactsQuery = useSessionArtifacts(user.user_id, currentSessionId);
  const [capsuleKeyword, setCapsuleKeyword] = useState("");
  const [selectedCapsuleId, setSelectedCapsuleId] = useState("");
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [artifactPreviewUrl, setArtifactPreviewUrl] = useState("");
  const [artifactPreviewError, setArtifactPreviewError] =
    useState<Error | null>(null);
  const activeCapsules = capsulesQuery.data?.capsules ?? [];
  const activeArtifacts = artifactsQuery.data?.artifacts ?? [];
  const selectedInjectionCapsuleId =
    selectedCapsuleId || activeCapsules[0]?.capsule_id || "";
  const selectedArtifact =
    activeArtifacts.find(
      (artifact) => artifact.artifact_id === selectedArtifactId,
    ) ?? activeArtifacts[0];
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
  const refreshArtifacts = () => {
    if (!currentSessionId) {
      return;
    }

    void queryClient.invalidateQueries({
      queryKey: queryKeys.sessionArtifacts(user.user_id, currentSessionId),
    });
  };
  const uploadArtifact = useMutation({
    mutationFn: async (file: File) => {
      if (!currentSessionId) {
        throw new Error("Start the session before uploading an artifact.");
      }

      const contentType = file.type || "application/octet-stream";
      const kind = inferArtifactKind(file);
      const ticket = await createArtifactUpload(user.user_id, {
        content_type: contentType,
        filename: file.name,
        kind,
        session_id: currentSessionId,
        size_bytes: file.size,
        title: file.name,
      });
      const headers = new Headers(ticket.headers);
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", contentType);
      }
      if (!isMockSignedUploadUrl(ticket.url)) {
        const uploadResponse = await fetch(ticket.url, {
          body: file,
          headers,
          method: ticket.method,
        });
        if (!uploadResponse.ok) {
          throw new Error(`GCS upload failed with ${uploadResponse.status}`);
        }
      }
      return completeArtifactUpload(user.user_id, ticket.upload_id, {
        kind,
        payload_json: {
          content_type: contentType,
          filename: file.name,
          size_bytes: file.size,
        },
        session_id: currentSessionId,
        title: file.name,
      });
    },
    onSuccess: (data) => {
      setSelectedArtifactId(data.artifact.artifact_id);
      setArtifactPreviewUrl("");
      setArtifactPreviewError(null);
      refreshArtifacts();
    },
    onError: (caught) => {
      setArtifactPreviewError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });
  const previewArtifact = useMutation({
    mutationFn: async (artifact: SessionArtifact) => {
      const content = artifact.contents?.[0];
      if (!content) {
        throw new Error("Artifact has no content.");
      }
      return getArtifactContentURL(
        user.user_id,
        artifact.artifact_id,
        content.ref || "main",
        "inline",
      );
    },
    onSuccess: (data) => {
      setSelectedArtifactId(data.artifact.artifact_id);
      setArtifactPreviewUrl(data.url);
      setArtifactPreviewError(null);
    },
    onError: (caught) => {
      setArtifactPreviewError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });
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
  const refreshActiveSessionRuntime = useCallback(() => {
    if (activeNodeId && activeAgentId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessions(user.user_id, activeNodeId, activeAgentId),
      });
    }
    if (activeAgentId && currentSessionId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessionHistory(
          user.user_id,
          activeAgentId,
          currentSessionId,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.queuedSessionTurn(
          user.user_id,
          activeAgentId,
          currentSessionId,
        ),
      });
    }
  }, [
    activeAgentId,
    activeNodeId,
    currentSessionId,
    queryClient,
    user.user_id,
  ]);
  const lastHistoryMessageID = lastMessageID(historyQuery.data?.messages);
  const shouldObserveSessionTurn =
    Boolean(activeAgentId && currentSessionId) &&
    isActiveSessionRunStatus(
      activeSession?.run_status ?? activeSession?.status,
    ) &&
    conversationRun.status !== "streaming" &&
    conversationRun.status !== "waiting_approval";
  const queuedTurnQueryKey = queryKeys.queuedSessionTurn(
    user.user_id,
    activeAgentId ?? "pending",
    currentSessionId ?? "pending",
  );
  const queuedTurnQuery = useQuery({
    queryKey: queuedTurnQueryKey,
    queryFn: () =>
      getQueuedSessionTurn(
        user.user_id,
        activeAgentId as string,
        currentSessionId as string,
      ),
    enabled: Boolean(activeAgentId && currentSessionId),
    refetchInterval: (query) =>
      query.state.data
        ? false
        : shouldObserveSessionTurn ||
            conversationRun.status === "streaming" ||
            conversationRun.status === "waiting_approval" ||
            queuedFollowUpSessionId === currentSessionId
          ? 1500
          : false,
    refetchOnWindowFocus: true,
  });
  const shouldFollowQueuedTurn =
    Boolean(currentSessionId) &&
    (Boolean(queuedTurnQuery.data) ||
      queuedFollowUpSessionId === currentSessionId);
  const handleQueuedTurnStarted = useCallback(() => {
    if (activeAgentId && currentSessionId) {
      setQueuedFollowUpSessionId(currentSessionId);
      queryClient.setQueryData(
        queryKeys.queuedSessionTurn(
          user.user_id,
          activeAgentId,
          currentSessionId,
        ),
        null,
      );
    }
    refreshActiveSessionRuntime();
  }, [
    activeAgentId,
    currentSessionId,
    queryClient,
    refreshActiveSessionRuntime,
    user.user_id,
  ]);
  const handleQueuedTurnFinished = useCallback(() => {
    setQueuedFollowUpSessionId(null);
    refreshActiveSessionRuntime();
  }, [refreshActiveSessionRuntime]);
  const handleQueuedTurnUnavailable = useCallback(() => {
    setQueuedFollowUpSessionId(null);
    refreshActiveSessionRuntime();
  }, [refreshActiveSessionRuntime]);
  const sessionObserver = useSessionObserver({
    afterMessageId: shouldFollowQueuedTurn ? undefined : lastHistoryMessageID,
    agentId: activeAgentId,
    enabled: Boolean(activeAgentId && currentSessionId),
    followQueuedTurn: shouldFollowQueuedTurn,
    onBufferMiss: refreshActiveSessionRuntime,
    onNoRunningTurn: refreshActiveSessionRuntime,
    onQueuedTurnFinished: handleQueuedTurnFinished,
    onQueuedTurnStarted: handleQueuedTurnStarted,
    onQueuedTurnUnavailable: handleQueuedTurnUnavailable,
    onTurnDone: refreshActiveSessionRuntime,
    sessionId: currentSessionId,
    userId: user.user_id,
  });
  const isTurnRunning =
    conversationRun.status === "streaming" ||
    conversationRun.status === "waiting_approval" ||
    sessionObserver.status === "observing";
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
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });

  const stopTurn = useMutation({
    mutationFn: async () => {
      if (!activeAgentId || !currentSessionId) {
        throw new Error("Wait for the session id before stopping the turn.");
      }

      return stopSessionTurn(user.user_id, activeAgentId, currentSessionId, {
        reason: "user_requested",
      });
    },
    onMutate: () => {
      setSendError(null);
    },
    onSuccess: () => {
      if (activeNodeId && activeAgentId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessions(
            user.user_id,
            activeNodeId,
            activeAgentId,
          ),
        });
      }
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
    onError: (caught) => {
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });
  const queueTurn = useMutation({
    mutationFn: async (input: string) => {
      if (!activeAgentId || !currentSessionId) {
        throw new Error("Wait for the session id before queuing the turn.");
      }

      return queueSessionTurn(user.user_id, activeAgentId, currentSessionId, {
        input,
      });
    },
    onMutate: () => {
      setSendError(null);
    },
    onSuccess: () => {
      setDraft("");
      setQueuedFollowUpSessionId(currentSessionId ?? null);
      void queryClient.invalidateQueries({ queryKey: queuedTurnQueryKey });
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
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });
  const updateQueuedTurn = useMutation({
    mutationFn: async (input: string) => {
      if (!activeAgentId || !currentSessionId) {
        throw new Error("Wait for the session id before updating the queue.");
      }

      return updateQueuedSessionTurn(
        user.user_id,
        activeAgentId,
        currentSessionId,
        { input },
      );
    },
    onMutate: () => {
      setSendError(null);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queuedTurnQueryKey, data);
      setQueuedTurnEditingId(null);
      setQueuedTurnDraft("");
    },
    onError: (caught) => {
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });
  const deleteQueuedTurn = useMutation({
    mutationFn: async () => {
      if (!activeAgentId || !currentSessionId) {
        throw new Error("Wait for the session id before deleting the queue.");
      }

      return deleteQueuedSessionTurn(
        user.user_id,
        activeAgentId,
        currentSessionId,
      );
    },
    onMutate: () => {
      setSendError(null);
    },
    onSuccess: () => {
      queryClient.setQueryData(queuedTurnQueryKey, null);
      setQueuedFollowUpSessionId(null);
      setQueuedTurnEditingId(null);
      setQueuedTurnDraft("");
    },
    onError: (caught) => {
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });
  const steerTurn = useMutation({
    mutationFn: async (input: string) => {
      if (!activeAgentId || !currentSessionId) {
        throw new Error("Wait for the session id before steering the turn.");
      }

      return steerSessionTurn(user.user_id, activeAgentId, currentSessionId, {
        input,
      });
    },
    onMutate: () => {
      setSendError(null);
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: queuedTurnQueryKey });
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
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
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
      filterLiveEventsAlreadyInHistory(
        [...conversationRun.events, ...sessionObserver.events],
        historyEvents,
      ),
    [conversationRun.events, historyEvents, sessionObserver.events],
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
    !isTurnRunning &&
    !newSessionCwdInvalid &&
    draft.trim().length > 0;
  const canQueueTurn =
    isTurnRunning &&
    Boolean(activeAgentId && currentSessionId) &&
    draft.trim().length > 0 &&
    !queueTurn.isPending;
  const canSteerTurn =
    isTurnRunning &&
    Boolean(activeAgentId && currentSessionId) &&
    draft.trim().length > 0 &&
    !steerTurn.isPending;
  const canStopTurn =
    isTurnRunning &&
    Boolean(activeAgentId && currentSessionId) &&
    !stopTurn.isPending;
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
    if (!content || !activeAgentId || !activeNodeId || newSessionCwdInvalid) {
      return;
    }

    setSendError(null);
    if (isTurnRunning) {
      await queueTurn.mutateAsync(content);
      return;
    }

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
    isTurnRunning,
    newSessionApprovalMode,
    newSessionCwdInvalid,
    normalizedNewSessionCwd,
    queueTurn,
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

  function handleStopTurn() {
    if (!canStopTurn) {
      return;
    }

    stopTurn.mutate();
  }

  function handleSteerTurn() {
    const content = draft.trim();
    if (!canSteerTurn || !content) {
      return;
    }

    steerTurn.mutate(content);
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
      id: "tool",
      label: "Tool",
      description: "Selected timeline evidence",
      icon: <Wrench className="h-4 w-4" />,
      content: (
        <ToolEvidencePanel
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
          selection={selectedToolEvidence}
        />
      ),
    },
    {
      id: "artifacts",
      label: "Artifacts",
      description: "Uploaded files and generated outputs",
      icon: <FileText className="h-4 w-4" />,
      content: (
        <ArtifactTools
          artifacts={activeArtifacts}
          canUpload={Boolean(currentSessionId)}
          downloadHref={(artifact, ref) =>
            artifactContentDownloadHref(user.user_id, artifact.artifact_id, ref)
          }
          isLoading={artifactsQuery.isLoading}
          onPreview={(artifact) => previewArtifact.mutate(artifact)}
          onRefresh={refreshArtifacts}
          onSelect={(artifactId) => {
            setSelectedArtifactId(artifactId);
            setArtifactPreviewUrl("");
            setArtifactPreviewError(null);
          }}
          onUpload={(file) => uploadArtifact.mutate(file)}
          previewError={
            artifactPreviewError ??
            (previewArtifact.error instanceof Error
              ? previewArtifact.error
              : null)
          }
          previewPending={previewArtifact.isPending}
          previewUrl={artifactPreviewUrl}
          selectedArtifact={selectedArtifact}
          selectedArtifactId={selectedArtifact?.artifact_id ?? ""}
          uploadError={
            uploadArtifact.error instanceof Error ? uploadArtifact.error : null
          }
          uploadPending={uploadArtifact.isPending}
        />
      ),
    },
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

  const workbench = (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 overflow-hidden bg-canvas",
        embedded ? "h-full" : "flex-1 lg:h-[calc(100vh-var(--topbar-h))]",
      )}
    >
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
        <div className="flex items-center justify-between gap-2 border-b border-hairline bg-surface-1 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2">
            {(onMobileMenu || onMobileBack) && (
              <Button
                aria-label={
                  onMobileMenu
                    ? `Open ${mobileMenuLabel ?? "sidebar"}`
                    : `Back to ${mobileBackLabel ?? "Home"}`
                }
                className="lg:hidden"
                icon={
                  onMobileMenu ? (
                    <Menu className="h-4 w-4" />
                  ) : (
                    <ArrowLeft className="h-4 w-4" />
                  )
                }
                onClick={onMobileMenu ?? onMobileBack}
                size="icon"
                tooltip={
                  onMobileMenu
                    ? `Open ${mobileMenuLabel ?? "sidebar"}`
                    : `Back to ${mobileBackLabel ?? "Home"}`
                }
                type="button"
                variant="ghost"
              />
            )}
            <div className="min-w-0">
              <div className="flex min-w-0 gap-1 text-xs text-ink-tertiary sm:max-w-[52vw] sm:text-sm">
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
                  className="text-base font-medium sm:text-lg"
                  tooltip={sessionTitleTooltip}
                >
                  {sessionDisplayName}
                </TruncatedText>
              </div>
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
          className="min-h-0 flex-1 overflow-auto bg-canvas p-3 sm:p-4"
          onScroll={updateTimelineStickiness}
          ref={timelineScrollRef}
        >
          <div className="mx-auto grid w-full max-w-4xl gap-2">
            <SessionErrors
              messagesError={historyQuery.error}
              missingRouteState={!activeNodeId || !activeAgentId}
              sendError={
                sendError ?? queuedTurnQuery.error ?? conversationRun.error
              }
            />
            {workstreamItems.map((item) => (
              <WorkstreamItemCard
                agentOwnerInfos={agentOwnerInfosQuery.data ?? {}}
                item={item}
                key={item.id}
                onSelectToolEvidence={(selection) => {
                  setSelectedToolEvidence(selection);
                  setActiveSidePanelId("tool");
                }}
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
            <div aria-hidden="true" className="h-0" ref={timelineBottomRef} />
          </div>
        </div>

        <form
          className="mobile-safe-bottom relative z-10 border-t border-hairline bg-surface-1 p-3"
          onSubmit={handleSubmit}
        >
          <div className="mx-auto w-full max-w-4xl rounded-[22px] border border-hairline bg-surface-2 px-3 py-2 shadow-lg shadow-black/20">
            {queuedTurnQuery.data && (
              <div className="mb-2 grid gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xs font-medium text-primary-hover">
                    Queued next
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-tertiary">
                    {compactId(queuedTurnQuery.data.queued_turn_id)}
                  </span>
                  {queuedTurnEditingId !==
                  queuedTurnQuery.data.queued_turn_id ? (
                    <Button
                      disabled={deleteQueuedTurn.isPending}
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setQueuedTurnDraft(queuedTurnQuery.data?.input ?? "");
                        setQueuedTurnEditingId(
                          queuedTurnQuery.data?.queued_turn_id ?? null,
                        );
                      }}
                      size="icon"
                      tooltip="Edit queued message"
                      type="button"
                      variant="ghost"
                    />
                  ) : null}
                  <Button
                    disabled={deleteQueuedTurn.isPending}
                    icon={
                      deleteQueuedTurn.isPending ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )
                    }
                    onClick={() => deleteQueuedTurn.mutate()}
                    size="icon"
                    tooltip="Delete queued message"
                    type="button"
                    variant="ghost"
                  />
                </div>
                {queuedTurnEditingId === queuedTurnQuery.data.queued_turn_id ? (
                  <div className="grid gap-2">
                    <textarea
                      aria-label="Queued message"
                      autoFocus
                      className="max-h-32 min-h-16 w-full resize-y rounded-lg border border-hairline bg-canvas px-2.5 py-2 text-sm leading-5 text-ink outline-none focus:border-primary-focus focus:ring-2 focus:ring-primary-focus/20"
                      onChange={(event) =>
                        setQueuedTurnDraft(event.target.value)
                      }
                      value={queuedTurnDraft}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        disabled={updateQueuedTurn.isPending}
                        onClick={() => {
                          setQueuedTurnEditingId(null);
                          setQueuedTurnDraft("");
                        }}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={
                          updateQueuedTurn.isPending ||
                          queuedTurnDraft.trim().length === 0
                        }
                        icon={
                          updateQueuedTurn.isPending ? (
                            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )
                        }
                        onClick={() =>
                          updateQueuedTurn.mutate(queuedTurnDraft.trim())
                        }
                        size="sm"
                        type="button"
                        variant="primary"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="max-h-24 overflow-auto whitespace-pre-wrap text-sm leading-5 text-ink-muted">
                    {queuedTurnQuery.data.input}
                  </p>
                )}
              </div>
            )}
            <textarea
              className="max-h-40 min-h-20 w-full resize-none bg-transparent px-1 py-1 text-sm leading-5 text-ink outline-none placeholder:text-ink-tertiary"
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
                onClick={() => setActiveSidePanelId("artifacts")}
                size="icon"
                tooltip="Open artifacts"
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
              {isTurnRunning ? (
                <>
                  <Button
                    disabled={!canQueueTurn}
                    icon={
                      queueTurn.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )
                    }
                    size="icon"
                    tooltip={
                      currentSessionId
                        ? "Queue after current turn"
                        : "Waiting for session id"
                    }
                    type="submit"
                    variant="primary"
                  />
                  <Button
                    disabled={!canSteerTurn}
                    icon={
                      steerTurn.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )
                    }
                    onClick={handleSteerTurn}
                    size="icon"
                    tooltip={
                      currentSessionId
                        ? "Steer with this prompt"
                        : "Waiting for session id"
                    }
                    type="button"
                    variant="ghost"
                  />
                  <Button
                    disabled={!canStopTurn}
                    icon={
                      stopTurn.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Square className="h-4 w-4 fill-current" />
                      )
                    }
                    onClick={handleStopTurn}
                    size="icon"
                    tooltip={
                      currentSessionId
                        ? "Stop current turn"
                        : "Waiting for session id"
                    }
                    type="button"
                    variant="danger"
                  />
                </>
              ) : (
                <Button
                  disabled={!canSend}
                  icon={<Send className="h-4 w-4" />}
                  size="icon"
                  tooltip="Send prompt"
                  type="submit"
                  variant="primary"
                />
              )}
            </div>
          </div>
        </form>
      </section>

      {activeSidePanel && (
        <aside className="absolute inset-y-0 right-0 z-20 min-h-0 w-full overflow-auto border-l border-hairline bg-surface-1 shadow-2xl shadow-black/40 sm:w-[min(100vw,320px)] lg:relative lg:inset-auto lg:z-auto lg:w-[300px] lg:shadow-none">
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
          <div className="flex gap-1 border-b border-hairline px-3 py-2">
            {sidePanels.map((panel) => (
              <button
                className={cn(
                  "inline-flex min-h-8 flex-1 items-center justify-center gap-2 rounded-md px-2 text-xs transition",
                  activeSidePanelId === panel.id
                    ? "bg-surface-3 text-ink"
                    : "text-ink-tertiary hover:bg-surface-2 hover:text-ink-muted",
                )}
                key={panel.id}
                onClick={() => setActiveSidePanelId(panel.id)}
                type="button"
              >
                {panel.icon}
                <span className="min-w-0 truncate">{panel.label}</span>
              </button>
            ))}
          </div>
          <div className="p-4">{activeSidePanel.content}</div>
        </aside>
      )}
    </div>
  );

  return (
    <SessionWorkbenchFrame embedded={embedded} user={user}>
      {workbench}
    </SessionWorkbenchFrame>
  );
}

type SessionWorkbenchFrameProps = {
  children: ReactNode;
  embedded: boolean;
  user: User;
};

function SessionWorkbenchFrame({
  children,
  embedded,
  user,
}: SessionWorkbenchFrameProps) {
  if (embedded) {
    return <>{children}</>;
  }

  return <ConsoleLayout user={user}>{children}</ConsoleLayout>;
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

function lastMessageID(messages?: HistoryMessage[]) {
  if (!messages || messages.length === 0) {
    return undefined;
  }

  return messages[messages.length - 1]?.message_id;
}

function isActiveSessionRunStatus(status?: string) {
  return (
    status === "running" ||
    status === "waiting_approval" ||
    status === "cancelling" ||
    status === "canceling"
  );
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

function ArtifactTools({
  artifacts,
  canUpload,
  downloadHref,
  isLoading,
  onPreview,
  onRefresh,
  onSelect,
  onUpload,
  previewError,
  previewPending,
  previewUrl,
  selectedArtifact,
  selectedArtifactId,
  uploadError,
  uploadPending,
}: {
  artifacts: SessionArtifact[];
  canUpload: boolean;
  downloadHref: (artifact: SessionArtifact, ref: string) => string;
  isLoading: boolean;
  onPreview: (artifact: SessionArtifact) => void;
  onRefresh: () => void;
  onSelect: (artifactId: string) => void;
  onUpload: (file: File) => void;
  previewError: Error | null;
  previewPending: boolean;
  previewUrl: string;
  selectedArtifact?: SessionArtifact;
  selectedArtifactId: string;
  uploadError: Error | null;
  uploadPending: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-4">
      <input
        className="sr-only"
        disabled={!canUpload || uploadPending}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            onUpload(file);
          }
          event.currentTarget.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
      <div className="flex min-w-0 items-center gap-2">
        <Button
          disabled={!canUpload || uploadPending}
          icon={
            uploadPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )
          }
          onClick={() => fileInputRef.current?.click()}
          type="button"
          variant="primary"
        >
          Upload
        </Button>
        <Button
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={onRefresh}
          size="icon"
          tooltip="Refresh artifacts"
          type="button"
          variant="ghost"
        />
        <div className="min-w-0 flex-1" />
        <Badge className="font-mono">{String(artifacts.length)}</Badge>
      </div>
      {!canUpload && (
        <div className="rounded-lg border border-dashed border-hairline bg-canvas p-2 text-xs text-ink-tertiary">
          Start the session before uploading artifacts.
        </div>
      )}
      {uploadError && <InlineError error={uploadError} />}

      <section className="grid gap-2">
        {isLoading && (
          <div className="text-xs text-ink-tertiary">Loading artifacts</div>
        )}
        {artifacts.map((artifact) => {
          const content = primaryArtifactContent(artifact);
          const selected = artifact.artifact_id === selectedArtifactId;
          return (
            <button
              className={cn(
                "grid min-w-0 gap-2 rounded-lg border p-2 text-left transition",
                selected
                  ? "border-primary-focus bg-surface-3"
                  : "border-hairline bg-canvas hover:border-hairline-strong",
              )}
              key={artifact.artifact_id}
              onClick={() => onSelect(artifact.artifact_id)}
              type="button"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <TruncatedText className="text-sm font-medium text-ink">
                    {artifactTitle(artifact)}
                  </TruncatedText>
                  <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-ink-tertiary">
                    <span className="shrink-0">{artifact.kind}</span>
                    {content?.size_bytes ? (
                      <span className="shrink-0">
                        {formatBytes(content.size_bytes)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Badge>{artifact.status}</Badge>
              </div>
              {content?.filename && (
                <MonoId tooltip={content.filename}>{content.filename}</MonoId>
              )}
            </button>
          );
        })}
        {!isLoading && artifacts.length === 0 && (
          <div className="rounded-lg border border-dashed border-hairline bg-canvas p-2 text-xs text-ink-tertiary">
            No artifacts for this session
          </div>
        )}
      </section>

      {selectedArtifact && (
        <section className="grid gap-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <TruncatedText className="text-sm font-medium">
              {artifactTitle(selectedArtifact)}
            </TruncatedText>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                disabled={previewPending}
                icon={
                  previewPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )
                }
                onClick={() => onPreview(selectedArtifact)}
                size="icon"
                tooltip="Preview artifact"
                type="button"
                variant="ghost"
              />
              <Button
                icon={<Download className="h-4 w-4" />}
                onClick={() => {
                  window.open(
                    downloadHref(
                      selectedArtifact,
                      primaryArtifactContent(selectedArtifact)?.ref ?? "main",
                    ),
                    "_blank",
                    "noreferrer",
                  );
                }}
                size="icon"
                tooltip="Download artifact"
                type="button"
                variant="ghost"
              />
            </div>
          </div>
          {previewError && <InlineError error={previewError} />}
          {previewUrl ? (
            <iframe
              className="h-64 w-full rounded-lg border border-hairline bg-white"
              src={previewUrl}
              title="Artifact preview"
            />
          ) : (
            <div className="rounded-lg border border-dashed border-hairline bg-canvas p-3 text-xs text-ink-tertiary">
              Select Preview to load a signed view URL.
            </div>
          )}
        </section>
      )}
    </div>
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

function primaryArtifactContent(artifact: SessionArtifact) {
  return (
    artifact.contents?.find((content) => content.ref === "main") ??
    artifact.contents?.[0]
  );
}

function artifactTitle(artifact: SessionArtifact) {
  return (
    artifact.title ||
    primaryArtifactContent(artifact)?.filename ||
    compactId(artifact.artifact_id)
  );
}

function inferArtifactKind(file: File) {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) {
    return "image";
  }
  if (
    file.type === "text/html" ||
    name.endsWith(".html") ||
    name.endsWith(".htm")
  ) {
    return "html_preview";
  }
  if (
    name.endsWith(".diff") ||
    name.endsWith(".patch") ||
    file.type === "text/x-diff"
  ) {
    return "code_diff";
  }
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    name.endsWith(".csv")
  ) {
    return "spreadsheet";
  }
  if (file.type.startsWith("text/")) {
    return "code_file";
  }
  return "file";
}

function isMockSignedUploadUrl(value: string) {
  try {
    return new URL(value).hostname === "mock-gcs.local";
  } catch {
    return false;
  }
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
