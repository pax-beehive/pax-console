"use client";

import {
  FormEvent,
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
  Monitor,
  Check,
  FileText,
  LoaderCircle,
  Menu,
  PanelRight,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import {
  artifactDocumentFromSessionArtifact,
  artifactPreviewPageHref,
  type ArtifactPreviewDescriptor,
} from "@/components/artifacts/artifact-document";
import { ArtifactViewerShell } from "@/components/artifacts/artifact-viewer-shell";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { Tooltip } from "@/components/ui/tooltip";
import {
  AgentPendingIndicator,
  PermissionDecisionOption,
  PermissionDecisionResult,
  PermissionDecisionState,
  ToolEvidencePanel,
  ToolEvidenceSelection,
  WorkstreamItemCard,
} from "@/components/sessions/session-event-cards";
import { showPendingActivity } from "./activity-label";
import { SessionBrowserApprovals } from "./session-browser-approvals";
import { SessionBrowserWindow } from "./session-browser-window";
import { WorkspacePicker } from "./workspace-picker";
import { SessionWorkspaceDetails } from "./session-workspace-details";
import { SessionComposer } from "@/components/sessions/session-composer";
import {
  SessionConfigSelector,
  configurationModel,
} from "@/components/sessions/session-config-selector";
import { SessionHeader } from "@/components/sessions/session-header";
import { SecureModeActivation } from "@/components/sessions/secure-mode-activation";
import { mergeRecoveredInitialPromptDraft } from "@/components/sessions/session-initial-prompt";
import { SessionRuntimeActions } from "@/components/sessions/session-runtime-actions";
import {
  canSeeSessionSidePanel,
  type SessionSidePanelId,
} from "@/components/sessions/session-side-panels";
import { RunBadge } from "@/components/sessions/run-badge";
import {
  artifactContentDownloadHref,
  completeUserAttachment,
  createAgentSession,
  createKnowledgeCapsule,
  createUserAttachment,
  decideApproval,
  deleteQueuedSessionTurn,
  flattenSessionHistoryPages,
  forceRefreshSessionConfiguration,
  getArtifactContentURL,
  getQueuedSessionTurn,
  injectKnowledgeCapsule,
  queueSessionTurn,
  refreshAgentPermissionCatalog,
  resetSessionRuntime,
  setSessionConfigOption,
  steerSessionTurn,
  stopSessionTurn,
  updateAgentSession,
  setAgentSessionPermission,
  updateQueuedSessionTurn,
  uploadUserAttachmentFile,
  useAgentOwnerInfos,
  useAgentPermissionCatalog,
  useProject,
  useKnowledgeCapsules,
  useKnowledgeInjections,
  useAgentSessions,
  useNodeAgents,
  useNodes,
  useUserSession,
  useSessionHistory,
  useSessionArtifacts,
  useSessionConfiguration,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import { ApiError, formatErrorDetail } from "@/features/api/errors";
import {
  KnowledgeCapsule,
  SessionKnowledgeInjection,
  SessionApprovalMode,
  SessionPaxConfig,
  SessionArtifact,
  User,
} from "@/features/api/types";
import {
  restoredScrollTop,
  shouldLoadEarlierHistory,
} from "@/components/sessions/session-history-scroll";
import { normalizeHistoryMessages } from "@/features/runtime/normalize-history-message";
import { mergeEvents } from "@/features/runtime/merge-session-events";
import {
  latestRuntimeTurnId,
  reconcileSessionTimeline,
} from "@/features/runtime/reconcile-session-timeline";
import {
  groupWorkstreamEvents,
  SessionEvent,
} from "@/features/runtime/session-events";
import { useConversationRun } from "@/features/runtime/use-conversation-run";
import {
  captureTimelineAnchor,
  restoreTimelineAnchor,
  type TimelineAnchor,
} from "@/features/runtime/timeline-anchor";
import { usePageResume } from "@/features/runtime/use-page-resume";
import { useSessionObserver } from "@/features/runtime/session-observer";
import { useSessionTurnObservation } from "@/features/runtime/use-session-turn-observation";
import { sessionDisplayStatus } from "@/features/runtime/session-display-status";
import { useSessionHistorySync } from "@/features/runtime/use-session-history-sync";
import { isSupportedSessionWorkspace } from "@/features/runtime/workspace-path";
import {
  PAX_AUTO_APPROVE_CHOICE_ID,
  PAX_MANUAL_CHOICE_ID,
  approvalModeForPermissionChoice,
  permissionChoicesFromCatalog,
  resolvePermissionChoiceId,
  shouldRecoverPermissionCatalogAfterCreateFailure,
  shouldWaitForInitialPermissionCatalog,
} from "@/features/permissions/permission-catalog";
import { compactId } from "@/lib/format";
import { useDocumentTitle } from "@/lib/use-document-title";
import { cn } from "@/lib/utils";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { useE2EESessionRuntime } from "@/features/e2ee/use-e2ee-session-runtime";
import { flattenEncryptedHistoryPages } from "@/features/e2ee/transport";
import { useConsoleStore } from "@/stores/console-store";

type SessionWorkbenchProps = {
  user: User;
  sessionId: string;
  nodeId?: string;
  agentId?: string;
  embedded?: boolean;
  initialApprovalMode?: SessionApprovalMode;
  initialPermissionChoiceId?: string;
  initialAttachments?: ComposerAttachment[];
  initialCwd?: string;
  initialInitializeOnly?: boolean;
  initialPrimaryProjectId?: string;
  initialPrompt?: string;
  initialPromptKey?: string;
  initialProjectTargetId?: string;
  initialTransport?: "manager" | "e2ee";
  mobileBackLabel?: string;
  mobileMenuLabel?: string;
  onSessionAssigned?: (sessionId: string) => void;
  onMobileBack?: () => void;
  onMobileMenu?: () => void;
};

type SessionSidePanel = {
  id: SessionSidePanelId;
  label: string;
  description: string;
  icon: ReactNode;
  content: ReactNode;
};

type PendingEncryptedBootstrap = {
  cwd: string;
  prompt: string;
  sessionId: string;
};

export type ComposerAttachment = {
  attachmentId: string;
  contentType?: string;
  filename: string;
  sizeBytes?: number;
};

const emptyAgentOwnerInfos = {};

export function SessionWorkbench({
  user,
  sessionId,
  nodeId,
  agentId,
  embedded = false,
  initialApprovalMode,
  initialPermissionChoiceId,
  initialAttachments,
  initialCwd,
  initialInitializeOnly = false,
  initialPrimaryProjectId,
  initialPrompt,
  initialPromptKey,
  initialProjectTargetId,
  initialTransport = "manager",
  mobileBackLabel,
  mobileMenuLabel,
  onSessionAssigned,
  onMobileBack,
  onMobileMenu,
}: SessionWorkbenchProps) {
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const showAdminFeatures = canSeeAdminFeatures(user, previewAsUser);
  const queryClient = useQueryClient();
  const routeSessionId = sessionId === "new" ? undefined : sessionId;
  const [currentSessionId, setCurrentSessionId] = useState(routeSessionId);
  const isNewSession = !currentSessionId;
  const sessionMetadataQuery = useUserSession(
    user.user_id,
    currentSessionId,
    undefined,
    5_000,
  );
  const sessionMetadata = sessionMetadataQuery.data ?? undefined;
  const nodesQuery = useNodes(user.user_id, 5_000);
  const nodes = nodesQuery.data?.nodes ?? [];
  const activeNodeId = currentSessionId
    ? (sessionMetadata?.node_id ?? nodeId)
    : (nodeId ?? nodes[0]?.node_id);
  const activeNode =
    nodes.find((node) => node.node_id === activeNodeId) ??
    (currentSessionId ? undefined : nodes[0]);
  const agentsQuery = useNodeAgents(user.user_id, activeNodeId);
  const agents = agentsQuery.data?.agents ?? [];
  const activeAgentId = currentSessionId
    ? (sessionMetadata?.agent_id ?? agentId)
    : (agentId ?? agents[0]?.agent_id);
  const activeAgent = agents.find((agent) => agent.agent_id === activeAgentId);
  const permissionCatalogQuery = useAgentPermissionCatalog(
    user.user_id,
    activeAgentId,
    Boolean(activeAgentId),
  );
  const permissionChoices = useMemo(
    () => permissionChoicesFromCatalog(permissionCatalogQuery.data),
    [permissionCatalogQuery.data],
  );
  const sessionsQuery = useAgentSessions(
    user.user_id,
    activeNodeId,
    activeAgentId,
  );
  const [queuedFollowUpSessionId, setQueuedFollowUpSessionId] = useState<
    string | null
  >(null);
  const [newSessionCwd, setNewSessionCwd] = useState(initialCwd ?? "");
  const [newSessionApprovalMode, setNewSessionApprovalMode] =
    useState<SessionApprovalMode>(initialApprovalMode ?? "manual");
  const [newSessionPermissionChoiceId, setNewSessionPermissionChoiceId] =
    useState<string | undefined>(
      initialPermissionChoiceId ??
        (initialApprovalMode === "auto_approve_all"
          ? PAX_AUTO_APPROVE_CHOICE_ID
          : undefined),
    );
  const [pendingSessionPaxConfig, setPendingSessionPaxConfig] =
    useState<SessionPaxConfig | null>(null);
  const pendingInitialPromptRef = useRef(
    readInitialPrompt(initialPrompt, initialPromptKey),
  );
  const initialPromptSentRef = useRef(false);
  const initialPromptPermissionRef = useRef<{
    approvalMode: SessionApprovalMode;
    choiceId: string;
  } | null>(null);
  const [sendError, setSendError] = useState<Error | null>(null);
  const [pendingEncryptedBootstrap, setPendingEncryptedBootstrap] =
    useState<PendingEncryptedBootstrap | null>(null);
  const encryptedBootstrapStartedRef = useRef("");
  const [composerAttachments, setComposerAttachments] = useState<
    ComposerAttachment[]
  >(() => [...(initialAttachments ?? [])]);
  const [composerAttachmentError, setComposerAttachmentError] =
    useState<Error | null>(null);
  const [composerAttachmentUploadPending, setComposerAttachmentUploadPending] =
    useState(false);
  const [sessionNameEditing, setSessionNameEditing] = useState(false);
  const [sessionNameDraft, setSessionNameDraft] = useState("");
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const pendingHistoryPrependRef = useRef<{
    expectedPageCount: number;
    scrollHeight: number;
    scrollTop: number;
    anchor?: TimelineAnchor;
  } | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [activeSidePanelId, setActiveSidePanelId] =
    useState<SessionSidePanelId | null>(null);
  const [selectedToolEvidence, setSelectedToolEvidence] =
    useState<ToolEvidenceSelection | null>(null);
  const [permissionDecisions, setPermissionDecisions] = useState<
    Record<string, PermissionDecisionResult>
  >({});
  const normalizedNewSessionCwd = newSessionCwd.trim();
  const newSessionCwdInvalid =
    isNewSession &&
    normalizedNewSessionCwd.length > 0 &&
    !isSupportedSessionWorkspace(normalizedNewSessionCwd);
  const activeSession = useMemo(
    () =>
      sessionMetadata ??
      sessionsQuery.data?.sessions.find(
        (session) => session.session_id === currentSessionId,
      ),
    [currentSessionId, sessionMetadata, sessionsQuery.data?.sessions],
  );
  const projectQuery = useProject(
    user.user_id,
    activeSession?.primary_project_id ?? initialPrimaryProjectId,
  );
  const usesEncryptedTransport =
    initialTransport === "e2ee" || activeSession?.transport === "e2ee";
  const sessionConfigurationQuery = useSessionConfiguration(
    user.user_id,
    activeNodeId,
    activeAgentId,
    currentSessionId,
    !usesEncryptedTransport,
  );
  const activeSessionReportedRunning = isActiveSessionRunStatus(
    activeSession?.runtime_status,
  );
  const activeSessionRuntimeBlocksPrompt =
    activeSessionReportedRunning || activeSession?.runtime_status === "unknown";
  const isExternallyCreatedSession = Boolean(
    !usesEncryptedTransport &&
    currentSessionId &&
    activeSession?.source &&
    activeSession.source !== "acp_tunnel",
  );
  const {
    turnId: observedTurnId,
    suppressed: observerSuppressed,
    suppress: suppressObservedTurn,
  } = useSessionTurnObservation(
    currentSessionId,
    activeSession?.runtime_turn_instance_id,
    activeSessionReportedRunning,
  );
  const activePaxConfig =
    activeSession?.pax_config ?? pendingSessionPaxConfig ?? undefined;
  const effectiveNewSessionPermissionChoiceId = resolvePermissionChoiceId(
    permissionChoices,
    newSessionApprovalMode,
    newSessionPermissionChoiceId,
    permissionCatalogQuery.data?.default_choice_id,
    permissionCatalogQuery.isPending,
  );
  const effectiveNewSessionApprovalMode = approvalModeForPermissionChoice(
    effectiveNewSessionPermissionChoiceId,
  );
  const displayedApprovalMode =
    activePaxConfig?.approval_mode ?? effectiveNewSessionApprovalMode;
  const displayedPermissionChoiceId =
    activePaxConfig?.permission_choice_id ??
    effectiveNewSessionPermissionChoiceId;
  const displayedWorkspace = currentSessionId
    ? (activePaxConfig?.cwd ?? initialCwd ?? "")
    : normalizedNewSessionCwd;
  const shouldShowReadOnlyWorkspace = Boolean(
    currentSessionId && displayedWorkspace,
  );
  const composerDraftKey =
    currentSessionId ??
    `new:${activeNodeId ?? "node"}:${activeAgentId ?? "agent"}`;
  const sessionDisplayName =
    activeSession?.name?.trim() ||
    (currentSessionId ? compactId(currentSessionId) : "New session");
  useDocumentTitle(sessionDisplayName);
  const sessionTitleTooltip =
    activeSession?.name && currentSessionId
      ? `${activeSession.name} (${currentSessionId})`
      : (currentSessionId ?? "New session");
  const handleSessionAssigned = useCallback(
    (nextSessionId: string, notifyParent = true) => {
      if (activeAgentId) {
        // Start an imperative refresh before isNewSession disables the query.
        // QueryClient keeps this request alive and updates the agent-scoped key.
        void refreshAgentPermissionCatalog(
          queryClient,
          user.user_id,
          activeAgentId,
        ).catch(() => undefined);
      }
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.userSessionsRoot(user.user_id),
      });
      if (!notifyParent) {
        return;
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
  const plainHistoryQuery = useSessionHistory(
    user.user_id,
    activeSession && !usesEncryptedTransport ? currentSessionId : undefined,
  );
  const encryptedRuntime = useE2EESessionRuntime({
    agentId: activeAgentId,
    enabled: usesEncryptedTransport,
    sessionId: currentSessionId,
    userId: user.user_id,
  });
  const sendEncryptedMessage = encryptedRuntime.sendMessage;
  const startEncryptedNativeSession = encryptedRuntime.startSession;
  const beginEncryptedSession = useCallback(
    async (prompt: string) => {
      if (!activeAgentId || !activeNodeId) {
        throw new Error("Select a node and agent before starting a session");
      }
      if (composerAttachments.length > 0) {
        throw new Error(
          "Encrypted session attachments are not supported yet. Remove the files before starting.",
        );
      }
      if (encryptedRuntime.keyLoading) {
        throw new Error(
          "The browser is still loading this agent's encryption key",
        );
      }
      if (!encryptedRuntime.rootKeyAvailable) {
        throw new Error(
          "This browser does not have this agent's encryption key. Pair it from Settings / Security before starting an encrypted session.",
        );
      }

      const session = await createAgentSession(
        user.user_id,
        activeNodeId,
        activeAgentId,
        "Encrypted session",
        { primaryProjectId: initialPrimaryProjectId },
      );
      setPendingSessionPaxConfig({
        cwd: normalizedNewSessionCwd || undefined,
        approval_mode: newSessionApprovalMode,
      });
      setPendingEncryptedBootstrap({
        cwd: normalizedNewSessionCwd || "/tmp",
        prompt,
        sessionId: session.session_id,
      });
      handleSessionAssigned(session.session_id, false);
    },
    [
      activeAgentId,
      activeNodeId,
      composerAttachments.length,
      encryptedRuntime.keyLoading,
      encryptedRuntime.rootKeyAvailable,
      handleSessionAssigned,
      initialPrimaryProjectId,
      newSessionApprovalMode,
      normalizedNewSessionCwd,
      user.user_id,
    ],
  );
  const historyQuery = usesEncryptedTransport
    ? encryptedRuntime.historyQuery
    : plainHistoryQuery;
  const encryptedKeyError =
    usesEncryptedTransport &&
    !encryptedRuntime.keyLoading &&
    !encryptedRuntime.rootKeyAvailable
      ? new Error(
          "This browser does not have this agent's encryption key. Pair it from Settings / Security to decrypt the session.",
        )
      : null;

  useEffect(() => {
    const pending = pendingEncryptedBootstrap;
    if (
      !pending ||
      pending.sessionId !== currentSessionId ||
      encryptedRuntime.keyLoading ||
      !encryptedRuntime.rootKeyAvailable ||
      encryptedBootstrapStartedRef.current === pending.sessionId
    ) {
      return;
    }

    encryptedBootstrapStartedRef.current = pending.sessionId;
    void startEncryptedNativeSession(pending.cwd)
      .then(() => {
        handleSessionAssigned(pending.sessionId);
        return pending.prompt
          ? sendEncryptedMessage(pending.prompt)
          : undefined;
      })
      .then(() => {
        setPendingEncryptedBootstrap(null);
        setComposerAttachments([]);
        setComposerAttachmentError(null);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.userSessionsRoot(user.user_id),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessionMetadata(user.user_id, pending.sessionId),
        });
        if (activeNodeId && activeAgentId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.sessions(
              user.user_id,
              activeNodeId,
              activeAgentId,
            ),
          });
        }
      })
      .catch((caught) => {
        setPendingEncryptedBootstrap(null);
        setSendError(
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      });
  }, [
    activeAgentId,
    activeNodeId,
    currentSessionId,
    encryptedRuntime.keyLoading,
    encryptedRuntime.rootKeyAvailable,
    handleSessionAssigned,
    pendingEncryptedBootstrap,
    queryClient,
    sendEncryptedMessage,
    startEncryptedNativeSession,
    user.user_id,
  ]);
  const baseHistoryMessages = useMemo(
    () =>
      usesEncryptedTransport
        ? flattenEncryptedHistoryPages(
            encryptedRuntime.historyQuery.data?.pages,
          )
        : flattenSessionHistoryPages(plainHistoryQuery.data?.pages),
    [
      encryptedRuntime.historyQuery.data?.pages,
      plainHistoryQuery.data?.pages,
      usesEncryptedTransport,
    ],
  );
  const historySync = useSessionHistorySync({
    userId: user.user_id,
    sessionId: usesEncryptedTransport ? undefined : currentSessionId,
    session: activeSession,
    history: baseHistoryMessages,
    metadataVersion: sessionMetadataQuery.dataUpdatedAt,
  });
  const historyMessages = usesEncryptedTransport
    ? baseHistoryMessages
    : historySync.messages;
  const historyPageCount = historyQuery.data?.pages.length ?? 0;
  const {
    fetchNextPage: fetchNextHistoryPage,
    hasNextPage: hasNextHistoryPage,
    isFetchingNextPage: isFetchingNextHistoryPage,
  } = historyQuery;
  const capsulesQuery = useKnowledgeCapsules(
    showAdminFeatures ? user.user_id : undefined,
    {
      status: "active",
    },
  );
  const injectionsQuery = useKnowledgeInjections(
    showAdminFeatures ? user.user_id : undefined,
    showAdminFeatures ? currentSessionId : undefined,
  );
  const artifactsQuery = useSessionArtifacts(user.user_id, currentSessionId);
  const [capsuleKeyword, setCapsuleKeyword] = useState("");
  const [selectedCapsuleId, setSelectedCapsuleId] = useState("");
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
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
    void queryClient.invalidateQueries({
      queryKey: queryKeys.sessionHistory(user.user_id, currentSessionId),
    });
  };
  const refreshArtifacts = () => {
    if (!currentSessionId) {
      return;
    }

    void queryClient.invalidateQueries({
      queryKey: queryKeys.sessionArtifacts(user.user_id, currentSessionId),
    });
  };
  const handleAddComposerAttachments = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      setComposerAttachmentError(null);
      setComposerAttachmentUploadPending(true);
      try {
        for (const file of files) {
          const ticket = await createUserAttachment(user.user_id, {
            content_type: file.type || "application/octet-stream",
            filename: file.name,
            sha256: "",
            size_bytes: file.size,
          });
          await uploadUserAttachmentFile(ticket, file);
          const completed = await completeUserAttachment(
            user.user_id,
            ticket.attachment.attachment_id,
          );
          setComposerAttachments((current) => [
            ...current,
            {
              attachmentId: completed.attachment.attachment_id,
              contentType: completed.attachment.content_type,
              filename: completed.attachment.filename,
              sizeBytes: completed.attachment.size_bytes,
            },
          ]);
        }
      } catch (caught) {
        setComposerAttachmentError(
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      } finally {
        setComposerAttachmentUploadPending(false);
      }
    },
    [user.user_id],
  );
  const handleRemoveComposerAttachment = useCallback((attachmentId: string) => {
    setComposerAttachments((current) =>
      current.filter((attachment) => attachment.attachmentId !== attachmentId),
    );
    setComposerAttachmentError(null);
  }, []);

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
  const refreshActiveSessionRuntime = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.nodes(user.user_id),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.userSessionsRoot(user.user_id),
    });
    if (activeNodeId && activeAgentId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessions(user.user_id, activeNodeId, activeAgentId),
      });
    }
    if (currentSessionId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessionMetadata(user.user_id, currentSessionId),
      });
    }
    if (activeAgentId && currentSessionId) {
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
  const conversationRun = useConversationRun({
    agentId: activeAgentId,
    nodeId: activeNodeId,
    onSession: handleSessionAssigned,
    onTurnEnd: refreshActiveSessionRuntime,
    runtimeSnapshot: usesEncryptedTransport
      ? undefined
      : {
          status: activeSession?.runtime_status,
          requestedAt: sessionMetadata?.runtimeSnapshotRequestedAt,
        },
    sessionId: routeSessionId,
    userId: user.user_id,
  });
  const finishCalibratedConversation = conversationRun.finishObservedTurn;
  useEffect(() => {
    const turnId = latestRuntimeTurnId(conversationRun.events);
    if (
      !usesEncryptedTransport &&
      turnId &&
      (conversationRun.status === "streaming" ||
        conversationRun.status === "waiting_approval") &&
      historySync.calibratedTurnIds.includes(turnId)
    ) {
      finishCalibratedConversation(turnId);
    }
  }, [
    conversationRun.events,
    conversationRun.status,
    historySync.calibratedTurnIds,
    finishCalibratedConversation,
    usesEncryptedTransport,
  ]);
  usePageResume(refreshActiveSessionRuntime, { includeWindowFocus: true });
  useEffect(() => {
    // A terminal-triggered refresh can race paxd's final runtime snapshot.
    // Once detail polling observes the transition, refresh the rails as well.
    void queryClient.invalidateQueries({
      queryKey: queryKeys.userSessionsRoot(user.user_id),
    });
    if (activeNodeId && activeAgentId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessions(user.user_id, activeNodeId, activeAgentId),
      });
    }
  }, [
    activeSession?.runtime_status,
    activeSession?.runtime_turn_instance_id,
    activeAgentId,
    activeNodeId,
    queryClient,
    user.user_id,
  ]);

  const calibrateHistoryTurn = historySync.calibrate;
  const completedConversationTurnVersion = conversationRun.completedTurnVersion;
  const calibratedConversationVersionRef = useRef(0);
  useEffect(() => {
    if (
      completedConversationTurnVersion >
      calibratedConversationVersionRef.current
    ) {
      calibratedConversationVersionRef.current =
        completedConversationTurnVersion;
      refreshActiveSessionRuntime();
      calibrateHistoryTurn(latestRuntimeTurnId(conversationRun.events));
    }
  }, [
    completedConversationTurnVersion,
    refreshActiveSessionRuntime,
    calibrateHistoryTurn,
    conversationRun.events,
  ]);
  const shouldObserveSessionTurn =
    !usesEncryptedTransport &&
    Boolean(activeAgentId && currentSessionId) &&
    (!observerSuppressed || conversationRun.transportInterrupted) &&
    (conversationRun.transportInterrupted ||
      (activeSessionReportedRunning &&
        conversationRun.status !== "streaming" &&
        conversationRun.status !== "waiting_approval"));
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
    enabled: Boolean(
      !usesEncryptedTransport && activeAgentId && currentSessionId,
    ),
    refetchInterval: (query) =>
      query.state.data
        ? 1500
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
    ((Boolean(queuedTurnQuery.data) &&
      queuedTurnQuery.data?.state !== "uncertain") ||
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
  const finishConversationRunFromObserver = conversationRun.finishObservedTurn;
  const markConversationObserverConnected =
    conversationRun.markObserverConnected;
  const conversationTransportInterrupted = conversationRun.transportInterrupted;
  const retryTerminalHistoryHandoff = historySync.calibrate;
  const handleNoRunningTurn = useCallback(() => {
    const interruptedTurnId = latestRuntimeTurnId(conversationRun.events);
    finishConversationRunFromObserver(interruptedTurnId ?? observedTurnId);
    suppressObservedTurn();
    refreshActiveSessionRuntime();
    retryTerminalHistoryHandoff(interruptedTurnId);
  }, [
    conversationRun.events,
    observedTurnId,
    suppressObservedTurn,
    finishConversationRunFromObserver,
    refreshActiveSessionRuntime,
    retryTerminalHistoryHandoff,
  ]);
  const handleObserverConnected = useCallback(() => {
    if (conversationTransportInterrupted) {
      markConversationObserverConnected();
    }
  }, [conversationTransportInterrupted, markConversationObserverConnected]);
  const handleObservedTurnDone = useCallback(
    (turnId?: string) => {
      finishConversationRunFromObserver(turnId);
      refreshActiveSessionRuntime();
      retryTerminalHistoryHandoff(turnId);
    },
    [
      finishConversationRunFromObserver,
      refreshActiveSessionRuntime,
      retryTerminalHistoryHandoff,
    ],
  );
  const handleObservedTurnEnd = useCallback(
    (turnId?: string) => {
      // End frames are a UI/status hint, not proof that every history page is durable.
      if (turnId) finishConversationRunFromObserver(turnId);
      refreshActiveSessionRuntime();
    },
    [finishConversationRunFromObserver, refreshActiveSessionRuntime],
  );
  const sessionObserver = useSessionObserver({
    agentId: activeAgentId,
    // After a transport interruption or page resume, a committed observer
    // snapshot takes ownership from the potentially stalled conversation.
    enabled:
      !usesEncryptedTransport &&
      (shouldObserveSessionTurn || shouldFollowQueuedTurn),
    turnId: conversationRun.transportInterrupted
      ? latestRuntimeTurnId(conversationRun.events)?.startsWith("pending-turn:")
        ? undefined
        : latestRuntimeTurnId(conversationRun.events)
      : activeSessionReportedRunning
        ? observedTurnId
        : undefined,
    followQueuedTurn: shouldFollowQueuedTurn,
    onBufferMiss: refreshActiveSessionRuntime,
    onConnected: handleObserverConnected,
    onNoRunningTurn: handleNoRunningTurn,
    onQueuedTurnFinished: handleQueuedTurnFinished,
    onQueuedTurnStarted: handleQueuedTurnStarted,
    onQueuedTurnUnavailable: handleQueuedTurnUnavailable,
    onTurnEnd: handleObservedTurnEnd,
    onTurnDone: handleObservedTurnDone,
    sessionId: currentSessionId,
    userId: user.user_id,
  });
  const displayedRunStatus = sessionDisplayStatus(
    activeSession?.runtime_status,
    {
      ownedTurnId: usesEncryptedTransport
        ? undefined
        : conversationRun.activeTurnId,
      runtimeTurnId: activeSession?.runtime_turn_instance_id,
      ownedConversationStatus: usesEncryptedTransport
        ? encryptedRuntime.status === "locked"
          ? undefined
          : encryptedRuntime.status
        : conversationRun.status,
    },
  );
  const isTurnRunning = usesEncryptedTransport
    ? Boolean(pendingEncryptedBootstrap) ||
      activeSessionRuntimeBlocksPrompt ||
      encryptedRuntime.status === "streaming"
    : shouldFollowQueuedTurn ||
      (displayedRunStatus !== "done" &&
        displayedRunStatus !== "cancelled" &&
        displayedRunStatus !== "error" &&
        (conversationRun.status === "streaming" ||
          conversationRun.status === "waiting_approval" ||
          shouldObserveSessionTurn ||
          activeSession?.runtime_status === "unknown"));
  const [pendingSessionConfigOptionId, setPendingSessionConfigOptionId] =
    useState<string>();
  const updateSessionConfiguration = useMutation({
    mutationFn: async ({
      configId,
      value,
    }: {
      configId: string;
      value: string | boolean;
    }) => {
      if (!activeNodeId || !activeAgentId || !currentSessionId) {
        throw new Error("Start the session before changing its configuration.");
      }
      return setSessionConfigOption(
        user.user_id,
        activeNodeId,
        activeAgentId,
        currentSessionId,
        configId,
        value,
      );
    },
    onMutate: ({ configId }) => {
      setPendingSessionConfigOptionId(configId);
      setSendError(null);
    },
    onSuccess: (configuration) => {
      if (activeNodeId && activeAgentId && currentSessionId) {
        queryClient.setQueryData(
          queryKeys.sessionConfiguration(
            user.user_id,
            activeNodeId,
            activeAgentId,
            currentSessionId,
          ),
          configuration,
        );
      }
    },
    onError: (caught) => {
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
    onSettled: () => setPendingSessionConfigOptionId(undefined),
  });
  const refreshSessionConfiguration = useMutation({
    mutationFn: async () => {
      if (!activeNodeId || !activeAgentId || !currentSessionId) {
        throw new Error(
          "Start the session before refreshing its configuration.",
        );
      }
      return forceRefreshSessionConfiguration(
        user.user_id,
        activeNodeId,
        activeAgentId,
        currentSessionId,
      );
    },
    onSuccess: (configuration) => {
      if (activeNodeId && activeAgentId && currentSessionId) {
        queryClient.setQueryData(
          queryKeys.sessionConfiguration(
            user.user_id,
            activeNodeId,
            activeAgentId,
            currentSessionId,
          ),
          configuration,
        );
      }
      setSendError(null);
    },
    onError: (caught) => {
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
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
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });
  const updateSessionPermission = useMutation({
    mutationFn: async (permissionChoiceId: string) => {
      if (!activeNodeId || !activeAgentId || !currentSessionId) {
        throw new Error("Start the session before changing permissions.");
      }
      return setAgentSessionPermission(
        user.user_id,
        activeNodeId,
        activeAgentId,
        currentSessionId,
        permissionChoiceId,
      );
    },
    onMutate: (permissionChoiceId) => {
      setPendingSessionPaxConfig((current) => ({
        ...current,
        cwd: activePaxConfig?.cwd ?? current?.cwd,
        approval_mode: approvalModeForPermissionChoice(permissionChoiceId),
        permission_choice_id: permissionChoiceId,
      }));
    },
    onSuccess: (session) => {
      setPendingSessionPaxConfig(session.pax_config ?? null);
      queryClient.setQueryData(
        queryKeys.sessionMetadata(user.user_id, session.session_id),
        session,
      );
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
      setPendingSessionPaxConfig(null);
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    },
  });
  const updateSessionName = useMutation({
    mutationFn: async (
      input: { name: string } | { use_reported_name: true },
    ) => {
      if (!activeNodeId || !activeAgentId || !currentSessionId) {
        throw new Error("Start the session before changing its name.");
      }

      return updateAgentSession(
        user.user_id,
        activeNodeId,
        activeAgentId,
        currentSessionId,
        input,
      );
    },
    onSuccess: (session) => {
      queryClient.setQueryData(
        queryKeys.sessionMetadata(user.user_id, session.session_id),
        session,
      );
      setSessionNameEditing(false);
      setSessionNameDraft("");
      setSendError(null);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.userSessionsRoot(user.user_id),
      });
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

  const resetStaleSessionStatus = useMutation({
    mutationFn: async () => {
      if (
        !activeAgentId ||
        !currentSessionId ||
        !activeSession?.runtime_turn_instance_id
      ) {
        throw new Error("This session has no active runtime turn to reset.");
      }
      return resetSessionRuntime(
        user.user_id,
        activeAgentId,
        currentSessionId,
        activeSession.runtime_turn_instance_id,
      );
    },
    onMutate: () => setSendError(null),
    onSuccess: () => {
      if (currentSessionId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessionMetadata(user.user_id, currentSessionId),
        });
      }
      void queryClient.invalidateQueries({
        queryKey: queryKeys.userSessionsRoot(user.user_id),
      });
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

  function beginSessionNameEdit() {
    setSessionNameDraft(sessionDisplayName);
    setSessionNameEditing(true);
  }

  function submitSessionName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = sessionNameDraft.trim();
    if (
      !name ||
      name.length > 120 ||
      name === activeSession?.name ||
      updateSessionName.isPending
    ) {
      return;
    }
    updateSessionName.mutate({ name });
  }

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
      conversationRun.markCancelled();
      refreshActiveSessionRuntime();
      if (activeNodeId && activeAgentId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessions(
            user.user_id,
            activeNodeId,
            activeAgentId,
          ),
        });
      }
      if (currentSessionId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessionHistory(user.user_id, currentSessionId),
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
      if (currentSessionId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessionHistory(user.user_id, currentSessionId),
        });
      }
    },
  });

  // The timeline merges durable REST history with live conversation events.
  // REST gives refresh/resume safety; the run stream gives low-latency updates.
  const historyEvents = useMemo(
    () => mergeEvents(normalizeHistoryMessages(historyMessages)),
    [historyMessages],
  );

  const reconciledTimeline = useMemo(
    () =>
      reconcileSessionTimeline(
        historyEvents,
        usesEncryptedTransport
          ? encryptedRuntime.events
          : conversationRun.events,
        usesEncryptedTransport ? [] : sessionObserver.events,
        usesEncryptedTransport ? [] : sessionObserver.snapshotTurnIds,
        usesEncryptedTransport ? undefined : historySync.calibratedTurnIds,
        !usesEncryptedTransport &&
          activeSession?.runtime_status === "idle" &&
          conversationRun.status !== "streaming" &&
          conversationRun.status !== "waiting_approval"
          ? historySync.snapshotTurnIds
          : undefined,
      ),
    [
      conversationRun.events,
      encryptedRuntime.events,
      historyEvents,
      usesEncryptedTransport,
      sessionObserver.events,
      sessionObserver.snapshotTurnIds,
      historySync.calibratedTurnIds,
      historySync.snapshotTurnIds,
      activeSession?.runtime_status,
      conversationRun.status,
    ],
  );
  const { timeline } = reconciledTimeline;
  const currentToolEvidence =
    selectedToolEvidence?.type === "tool"
      ? {
          ...selectedToolEvidence,
          event:
            timeline.find(
              (event): event is Extract<SessionEvent, { type: "tool_call" }> =>
                event.type === "tool_call" &&
                event.id === selectedToolEvidence.event.id &&
                event.turnId === selectedToolEvidence.event.turnId,
            ) ?? selectedToolEvidence.event,
        }
      : selectedToolEvidence;
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
  const isAgentResponsePending = showPendingActivity(
    displayedRunStatus,
    workstreamItems,
  );
  const mutateSessionApprovalMode = updateSessionApprovalMode.mutate;
  const mutateSessionPermission = updateSessionPermission.mutate;
  const selectPermissionChoice = useCallback(
    (choiceId: string) => {
      if (currentSessionId) {
        mutateSessionPermission(choiceId);
        return;
      }
      setNewSessionPermissionChoiceId(choiceId);
      setNewSessionApprovalMode(approvalModeForPermissionChoice(choiceId));
    },
    [currentSessionId, mutateSessionPermission],
  );
  const recoverPermissionCatalogAfterCreateFailure = useCallback(
    (caught: unknown, attemptedChoiceId: string) => {
      const status = caught instanceof ApiError ? caught.status : undefined;
      if (
        !shouldRecoverPermissionCatalogAfterCreateFailure(
          attemptedChoiceId,
          status,
        )
      ) {
        return false;
      }
      setNewSessionPermissionChoiceId(PAX_MANUAL_CHOICE_ID);
      setNewSessionApprovalMode("manual");
      if (activeAgentId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.agentPermissionCatalog(
            user.user_id,
            activeAgentId,
          ),
        });
      }
      return true;
    },
    [activeAgentId, queryClient, user.user_id],
  );
  const toggleApprovalMode = useCallback(() => {
    const nextMode =
      displayedApprovalMode === "auto_approve_all"
        ? "manual"
        : "auto_approve_all";

    if (!currentSessionId) {
      setNewSessionApprovalMode(nextMode);
      return;
    }

    mutateSessionApprovalMode(nextMode);
  }, [currentSessionId, displayedApprovalMode, mutateSessionApprovalMode]);
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
  const loadEarlierHistory = useCallback(() => {
    const scrollElement = timelineScrollRef.current;
    if (
      !scrollElement ||
      pendingHistoryPrependRef.current ||
      !shouldLoadEarlierHistory({
        hasNextPage: Boolean(hasNextHistoryPage),
        isFetchingNextPage: isFetchingNextHistoryPage,
        scrollTop: scrollElement.scrollTop,
      })
    ) {
      return;
    }

    pendingHistoryPrependRef.current = {
      anchor: captureTimelineAnchor(scrollElement),
      expectedPageCount: historyPageCount + 1,
      scrollHeight: scrollElement.scrollHeight,
      scrollTop: scrollElement.scrollTop,
    };
    shouldStickToBottomRef.current = false;
    void fetchNextHistoryPage().then((result) => {
      if (result.isError) {
        pendingHistoryPrependRef.current = null;
      }
    });
  }, [
    fetchNextHistoryPage,
    hasNextHistoryPage,
    historyPageCount,
    isFetchingNextHistoryPage,
  ]);
  const handleTimelineScroll = useCallback(() => {
    updateTimelineStickiness();
    loadEarlierHistory();
  }, [loadEarlierHistory, updateTimelineStickiness]);

  const queueDraft = queueTurn.mutateAsync;
  const sendConversationMessage = conversationRun.sendMessage;
  const initializeConversationSession = conversationRun.initializeSession;
  const emptyCreationRef = useRef({ pending: false, lastStartedAt: -Infinity });
  const createEmptySession = useCallback(async () => {
    if (!activeAgentId || !activeNodeId || newSessionCwdInvalid) {
      return false;
    }
    const guard = emptyCreationRef.current;
    if (guard.pending || Date.now() - guard.lastStartedAt < 500) return false;
    guard.pending = true;
    guard.lastStartedAt = Date.now();
    const sourceDraftKey = composerDraftKey;
    setSendError(null);
    setPendingSessionPaxConfig({
      cwd: normalizedNewSessionCwd || undefined,
      approval_mode: effectiveNewSessionApprovalMode,
    });
    try {
      if (usesEncryptedTransport) {
        await beginEncryptedSession("");
        return true;
      }
      const result = await initializeConversationSession({
        approvalMode: effectiveNewSessionApprovalMode,
        cwd: normalizedNewSessionCwd || undefined,
        permissionChoiceId:
          effectiveNewSessionPermissionChoiceId === PAX_MANUAL_CHOICE_ID
            ? undefined
            : effectiveNewSessionPermissionChoiceId,
        primaryProjectId: initialPrimaryProjectId,
        projectTargetId: initialProjectTargetId,
      });
      if (result.sessionId) {
        const consoleStore = useConsoleStore.getState();
        consoleStore.setComposerDraft(
          result.sessionId,
          consoleStore.composerDrafts[sourceDraftKey] ?? "",
        );
      }
      return Boolean(result.sessionId);
    } catch (caught) {
      setPendingSessionPaxConfig(null);
      recoverPermissionCatalogAfterCreateFailure(
        caught,
        effectiveNewSessionPermissionChoiceId,
      );
      setSendError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
      return false;
    } finally {
      guard.pending = false;
    }
  }, [
    activeAgentId,
    activeNodeId,
    composerDraftKey,
    effectiveNewSessionApprovalMode,
    effectiveNewSessionPermissionChoiceId,
    initialPrimaryProjectId,
    initialProjectTargetId,
    initializeConversationSession,
    beginEncryptedSession,
    usesEncryptedTransport,
    newSessionCwdInvalid,
    normalizedNewSessionCwd,
    recoverPermissionCatalogAfterCreateFailure,
  ]);
  const initialEmptySessionStartedRef = useRef(false);
  useEffect(() => {
    if (
      !initialInitializeOnly ||
      !isNewSession ||
      (usesEncryptedTransport && encryptedRuntime.keyLoading) ||
      initialEmptySessionStartedRef.current
    ) {
      return;
    }
    initialEmptySessionStartedRef.current = true;
    void createEmptySession();
  }, [
    createEmptySession,
    initialInitializeOnly,
    encryptedRuntime.keyLoading,
    isNewSession,
    usesEncryptedTransport,
  ]);
  const clearSentAttachments = useCallback((attachmentIds: string[]) => {
    const sentIds = new Set(attachmentIds);
    setComposerAttachments((current) =>
      current.filter((attachment) => !sentIds.has(attachment.attachmentId)),
    );
    setComposerAttachmentError(null);
  }, []);
  const submitDraft = useCallback(
    async (content: string, onAccepted?: () => void) => {
      if (
        (!content && composerAttachments.length === 0) ||
        !activeAgentId ||
        !activeNodeId ||
        newSessionCwdInvalid
      ) {
        return false;
      }

      const attachmentIds = composerAttachments.map(
        (attachment) => attachment.attachmentId,
      );

      setSendError(null);
      try {
        if (usesEncryptedTransport) {
          if (isNewSession) {
            await beginEncryptedSession(content);
            setComposerAttachmentError(null);
            return true;
          }
          if (attachmentIds.length > 0) {
            setComposerAttachmentError(
              new Error(
                "Encrypted session attachments are not supported yet. Remove the files before sending.",
              ),
            );
            return false;
          }
          if (isTurnRunning) {
            setSendError(
              new Error(
                "Wait for the encrypted turn to finish before sending another prompt.",
              ),
            );
            return false;
          }
          await sendEncryptedMessage(content);
          setComposerAttachmentError(null);
          return true;
        }

        if (isTurnRunning) {
          if (attachmentIds.length > 0) {
            setComposerAttachmentError(
              new Error(
                "Attachments can only be sent on a fresh turn. Wait for the current run to finish or remove the files.",
              ),
            );
            return false;
          }
          await queueDraft(content);
          return true;
        }

        if (isNewSession) {
          setPendingSessionPaxConfig({
            cwd: normalizedNewSessionCwd || undefined,
            approval_mode: effectiveNewSessionApprovalMode,
          });
        }
        await sendConversationMessage(content, {
          ...(isNewSession
            ? {
                approvalMode: effectiveNewSessionApprovalMode,
                cwd: normalizedNewSessionCwd || undefined,
                permissionChoiceId:
                  effectiveNewSessionPermissionChoiceId === PAX_MANUAL_CHOICE_ID
                    ? undefined
                    : effectiveNewSessionPermissionChoiceId,
                primaryProjectId: initialPrimaryProjectId,
                projectTargetId: initialProjectTargetId,
              }
            : {}),
          ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
          attachments: composerAttachments,
          onAccepted: () => {
            clearSentAttachments(attachmentIds);
            onAccepted?.();
          },
        });
        return true;
      } catch (caught) {
        if (isNewSession) {
          setPendingSessionPaxConfig(null);
          recoverPermissionCatalogAfterCreateFailure(
            caught,
            effectiveNewSessionPermissionChoiceId,
          );
        }
        setSendError(
          caught instanceof Error ? caught : new Error(String(caught)),
        );
        return false;
      }
    },
    [
      activeAgentId,
      activeNodeId,
      beginEncryptedSession,
      composerAttachments,
      clearSentAttachments,
      usesEncryptedTransport,
      isNewSession,
      isTurnRunning,
      initialPrimaryProjectId,
      initialProjectTargetId,
      effectiveNewSessionApprovalMode,
      effectiveNewSessionPermissionChoiceId,
      newSessionCwdInvalid,
      normalizedNewSessionCwd,
      queueDraft,
      recoverPermissionCatalogAfterCreateFailure,
      sendEncryptedMessage,
      sendConversationMessage,
    ],
  );

  const deleteQueuedDraft = deleteQueuedTurn.mutate;
  const steerDraft = steerTurn.mutateAsync;
  const stopCurrentTurn = stopTurn.mutate;
  const updateQueuedDraft = updateQueuedTurn.mutateAsync;
  const handleDeleteQueuedTurn = useCallback(
    () => deleteQueuedDraft(),
    [deleteQueuedDraft],
  );
  const handleSteerTurn = useCallback(
    async (content: string) => {
      try {
        await steerDraft(content);
        return true;
      } catch {
        return false;
      }
    },
    [steerDraft],
  );
  const handleStopTurn = useCallback(() => {
    if (usesEncryptedTransport) {
      void encryptedRuntime.stop().catch((caught) => {
        setSendError(
          caught instanceof Error ? caught : new Error(String(caught)),
        );
      });
      return;
    }
    stopCurrentTurn();
  }, [encryptedRuntime, usesEncryptedTransport, stopCurrentTurn]);
  const handleUpdateQueuedTurn = useCallback(
    async (content: string) => {
      try {
        await updateQueuedDraft(content);
        return true;
      } catch {
        return false;
      }
    },
    [updateQueuedDraft],
  );

  const mutatePermissionDecision = decidePermission.mutate;
  const handlePermissionDecision = useCallback(
    (approvalId: string, decisionOption: PermissionDecisionOption) =>
      mutatePermissionDecision({
        approvalId,
        decisionOption,
      }),
    [mutatePermissionDecision],
  );
  const permissionDecision = useMemo<PermissionDecisionState>(
    () => ({
      decisions: permissionDecisions,
      error: decidePermission.error,
      pendingApprovalId: decidePermission.variables?.approvalId,
      pending: decidePermission.isPending,
      onDecision: handlePermissionDecision,
    }),
    [
      decidePermission.error,
      decidePermission.isPending,
      decidePermission.variables?.approvalId,
      handlePermissionDecision,
      permissionDecisions,
    ],
  );

  useEffect(() => {
    const content = pendingInitialPromptRef.current.trim();
    if (
      initialPromptSentRef.current ||
      sessionId !== "new" ||
      (!content && composerAttachments.length === 0) ||
      !activeAgentId ||
      !activeNodeId ||
      newSessionCwdInvalid ||
      (usesEncryptedTransport
        ? encryptedRuntime.keyLoading
        : conversationRun.status !== "idle")
    ) {
      return;
    }
    if (
      shouldWaitForInitialPermissionCatalog(
        initialPermissionChoiceId,
        permissionCatalogQuery.isPending,
      )
    ) {
      return;
    }

    if (!initialPromptPermissionRef.current) {
      initialPromptPermissionRef.current = {
        approvalMode: effectiveNewSessionApprovalMode,
        choiceId: effectiveNewSessionPermissionChoiceId,
      };
    }
    const initialPromptPermission = initialPromptPermissionRef.current;

    const timeoutId = window.setTimeout(() => {
      if (initialPromptSentRef.current) {
        return;
      }

      initialPromptSentRef.current = true;
      if (usesEncryptedTransport) {
        void submitDraft(content).then((accepted) => {
          if (accepted) {
            removeStoredInitialPrompt(initialPromptKey);
            return;
          }
          useConsoleStore
            .getState()
            .setComposerDraft(composerDraftKey, content);
        });
        return;
      }

      setSendError(null);
      setPendingSessionPaxConfig({
        cwd: normalizedNewSessionCwd || undefined,
        approval_mode: initialPromptPermission.approvalMode,
      });
      const attachmentIds = composerAttachments.map(
        (attachment) => attachment.attachmentId,
      );
      let initialAccepted = false;
      void sendConversationMessage(content, {
        approvalMode: initialPromptPermission.approvalMode,
        cwd: normalizedNewSessionCwd || undefined,
        permissionChoiceId:
          initialPromptPermission.choiceId === PAX_MANUAL_CHOICE_ID
            ? undefined
            : initialPromptPermission.choiceId,
        primaryProjectId: initialPrimaryProjectId,
        projectTargetId: initialProjectTargetId,
        ...(attachmentIds.length > 0 ? { attachmentIds } : {}),
        attachments: composerAttachments,
        onAccepted: () => {
          initialAccepted = true;
          clearSentAttachments(attachmentIds);
          removeStoredInitialPrompt(initialPromptKey);
        },
      })
        .then(() => {
          removeStoredInitialPrompt(initialPromptKey);
        })
        .catch((caught) => {
          setPendingSessionPaxConfig(null);
          recoverPermissionCatalogAfterCreateFailure(
            caught,
            initialPromptPermission.choiceId,
          );
          if (!initialAccepted) {
            const consoleStore = useConsoleStore.getState();
            consoleStore.setComposerDraft(
              composerDraftKey,
              mergeRecoveredInitialPromptDraft(
                content,
                consoleStore.composerDrafts[composerDraftKey] ?? "",
              ),
            );
          }
          pendingInitialPromptRef.current = "";
          initialPromptPermissionRef.current = null;
          // Keep automatic delivery latched off. The recovered draft is sent
          // only after an explicit retry.
          initialPromptSentRef.current = true;
          removeStoredInitialPrompt(initialPromptKey);
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
    composerAttachments,
    clearSentAttachments,
    conversationRun.status,
    composerDraftKey,
    encryptedRuntime.keyLoading,
    initialPromptKey,
    initialPermissionChoiceId,
    initialPrimaryProjectId,
    initialProjectTargetId,
    newSessionCwdInvalid,
    sessionId,
    effectiveNewSessionApprovalMode,
    effectiveNewSessionPermissionChoiceId,
    normalizedNewSessionCwd,
    permissionCatalogQuery.isPending,
    recoverPermissionCatalogAfterCreateFailure,
    sendConversationMessage,
    submitDraft,
    usesEncryptedTransport,
  ]);

  useEffect(() => {
    pendingHistoryPrependRef.current = null;
    shouldStickToBottomRef.current = true;
  }, [currentSessionId]);

  useLayoutEffect(() => {
    const pendingPrepend = pendingHistoryPrependRef.current;
    const shouldRestorePrepend =
      pendingPrepend && historyPageCount >= pendingPrepend.expectedPageCount;
    if (!shouldRestorePrepend && !shouldStickToBottomRef.current) {
      return;
    }

    {
      const scrollElement = timelineScrollRef.current;
      if (!scrollElement) {
        return;
      }

      const currentPrepend = pendingHistoryPrependRef.current;
      if (
        currentPrepend &&
        historyPageCount >= currentPrepend.expectedPageCount
      ) {
        if (!restoreTimelineAnchor(scrollElement, currentPrepend.anchor)) {
          scrollElement.scrollTop = restoredScrollTop(
            currentPrepend,
            scrollElement.scrollHeight,
          );
        }
        pendingHistoryPrependRef.current = null;
        updateTimelineStickiness();
        return;
      }

      if (shouldStickToBottomRef.current) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
        shouldStickToBottomRef.current = true;
      }
    }
  }, [historyPageCount, updateTimelineStickiness, workstreamItems]);

  const browserButton = activeNodeId ? (
    <Button
      aria-label="Watch browser"
      tooltip="Watch browser"
      aria-expanded={browserOpen}
      size="sm"
      className="w-full justify-start text-ink-muted"
      variant="ghost"
      icon={<Monitor className="h-4 w-4" />}
      onClick={() => {
        setBrowserOpen(true);
        setActiveSidePanelId(null);
      }}
    >
      <span>Open browser</span>
    </Button>
  ) : null;

  const sidePanels = (
    [
      {
        id: "tool",
        label: "Tool",
        description: "Selected timeline evidence",
        icon: <Wrench className="h-4 w-4" />,
        content: (
          <ToolEvidencePanel
            userId={user.user_id}
            permissionDecision={permissionDecision}
            selection={currentToolEvidence}
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
            downloadHref={(artifact, ref) =>
              artifactContentDownloadHref(
                user.user_id,
                artifact.artifact_id,
                ref,
              )
            }
            isLoading={artifactsQuery.isLoading}
            onLoadPreview={async (artifact) => {
              const content = primaryArtifactContent(artifact);
              if (!content) {
                throw new Error("Artifact has no content.");
              }
              const data = await getArtifactContentURL(
                user.user_id,
                artifact.artifact_id,
                content.ref || "main",
                "inline",
              );
              return {
                contentType: data.content.content_type,
                filename: data.content.filename,
                url: data.url,
              };
            }}
            onRefresh={refreshArtifacts}
            onSelect={setSelectedArtifactId}
            selectedArtifact={selectedArtifact}
            selectedArtifactId={selectedArtifact?.artifact_id ?? ""}
          />
        ),
      },
      {
        id: "browser",
        label: "Browser",
        description: "Browser on this session’s device",
        icon: <Monitor className="h-4 w-4" />,
        content: browserButton ?? (
          <p className="text-sm text-ink-tertiary">No device available.</p>
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
    ] satisfies SessionSidePanel[]
  ).filter(
    (panel) =>
      canSeeSessionSidePanel(panel.id, showAdminFeatures) &&
      (panel.id !== "tool" || activeSidePanelId === "tool"),
  );
  const activeSidePanel = sidePanels.find(
    (panel) => panel.id === activeSidePanelId,
  );
  const agentOwnerInfos = agentOwnerInfosQuery.data ?? emptyAgentOwnerInfos;
  const handleSelectToolEvidence = useCallback(
    (selection: ToolEvidenceSelection) => {
      setSelectedToolEvidence(selection);
      setActiveSidePanelId("tool");
    },
    [setActiveSidePanelId, setSelectedToolEvidence],
  );

  const workbench = (
    <div
      data-secure-mode={usesEncryptedTransport}
      className={cn(
        "relative isolate flex min-h-0 min-w-0 overflow-hidden transition-[background,box-shadow] duration-500",
        embedded ? "h-full" : "flex-1",
        usesEncryptedTransport
          ? "bg-[radial-gradient(circle_at_50%_105%,rgba(16,185,129,0.075),transparent_48%),linear-gradient(180deg,rgba(16,185,129,0.025),transparent_36%)] shadow-[inset_0_-1px_0_rgba(52,211,153,0.08)]"
          : "bg-canvas",
      )}
    >
      {usesEncryptedTransport && <SecureModeActivation showStatus={false} />}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent">
        <SessionHeader
          details={
            isNewSession ? (
              <WorkspacePicker
                value={newSessionCwd}
                targets={[]}
                save={false}
                canSave={false}
                disabled={!activeAgentId}
                onChange={setNewSessionCwd}
              />
            ) : shouldShowReadOnlyWorkspace ? (
              <SessionWorkspaceDetails workspace={displayedWorkspace} />
            ) : undefined
          }
          key={currentSessionId ?? "new"}
          surfaceClassName={
            usesEncryptedTransport
              ? "border-emerald-400/20 bg-emerald-500/[0.03] backdrop-blur-xl"
              : "border-hairline bg-surface-1"
          }
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {(onMobileMenu || onMobileBack) && (
              <Button
                aria-label={
                  onMobileMenu
                    ? `Open ${mobileMenuLabel ?? "sidebar"}`
                    : `Back to ${mobileBackLabel ?? "Chat"}`
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
                    : `Back to ${mobileBackLabel ?? "Chat"}`
                }
                type="button"
                variant="ghost"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="order-2 flex min-w-0 gap-1 text-xs text-ink-muted sm:max-w-[52vw] sm:text-sm">
                <TruncatedText>
                  {projectQuery.data?.project.display_name ??
                    activeNode?.name ??
                    activeNode?.hostname ??
                    "No project"}
                </TruncatedText>
                <span className="shrink-0">/</span>
                <TruncatedText>
                  {activeAgent?.name ?? activeAgentId ?? "Unknown agent"}
                </TruncatedText>
              </div>
              <div className="flex min-w-0 items-center gap-1">
                {sessionNameEditing ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1"
                    onSubmit={submitSessionName}
                  >
                    <input
                      aria-label="Session name"
                      autoFocus
                      className="h-8 min-w-0 max-w-80 flex-1 rounded-md border border-hairline-strong bg-surface-2 px-2 text-base font-medium text-ink outline-none focus:border-primary sm:text-sm"
                      maxLength={120}
                      onChange={(event) =>
                        setSessionNameDraft(event.target.value)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          setSessionNameEditing(false);
                          setSessionNameDraft("");
                        }
                      }}
                      value={sessionNameDraft}
                    />
                    <Button
                      aria-label="Save session name"
                      className="h-8 w-8"
                      disabled={
                        !sessionNameDraft.trim() ||
                        sessionNameDraft.trim() === activeSession?.name ||
                        updateSessionName.isPending
                      }
                      icon={
                        updateSessionName.isPending ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )
                      }
                      size="icon"
                      tooltip="Save session name"
                      type="submit"
                      variant="ghost"
                    />
                    {activeSession?.name_is_custom && (
                      <Button
                        aria-label="Use reported session name"
                        className="h-8 w-8"
                        disabled={updateSessionName.isPending}
                        icon={<RotateCcw className="h-4 w-4" />}
                        onClick={() =>
                          updateSessionName.mutate({
                            use_reported_name: true,
                          })
                        }
                        size="icon"
                        tooltip={`Use reported name: ${activeSession.reported_name ?? currentSessionId}`}
                        type="button"
                        variant="ghost"
                      />
                    )}
                    <Button
                      aria-label="Cancel session name edit"
                      className="h-8 w-8"
                      disabled={updateSessionName.isPending}
                      icon={<X className="h-4 w-4" />}
                      onClick={() => {
                        setSessionNameEditing(false);
                        setSessionNameDraft("");
                      }}
                      size="icon"
                      tooltip="Cancel"
                      type="button"
                      variant="ghost"
                    />
                  </form>
                ) : (
                  <>
                    <TruncatedText
                      className="text-base font-medium sm:text-lg"
                      tooltip={sessionTitleTooltip}
                    >
                      {sessionDisplayName}
                    </TruncatedText>
                  </>
                )}
                {usesEncryptedTransport && (
                  <Tooltip content="End-to-end encrypted between this browser and paxd">
                    <span
                      aria-label="End-to-end encrypted session"
                      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 text-[10px] font-semibold tracking-[0.14em] text-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_18px_rgba(52,211,153,0.06)]"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      E2EE
                    </span>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <RunBadge
              compact
              paxdOffline={activeNode?.online === false}
              error={
                usesEncryptedTransport
                  ? encryptedRuntime.error
                  : conversationRun.error
              }
              status={displayedRunStatus}
            />
            <SessionRuntimeActions
              canReset={Boolean(
                activeSession?.runtime_turn_instance_id &&
                activeSession.runtime_status !== "idle",
              )}
              isPending={resetStaleSessionStatus.isPending}
              onReset={() => resetStaleSessionStatus.mutateAsync()}
              onRename={currentSessionId ? beginSessionNameEdit : undefined}
            />
            {currentSessionId && (
              <Button
                className="shrink-0"
                aria-label={
                  activeSidePanel ? "Hide session panel" : "Open session panel"
                }
                icon={<PanelRight className="h-4 w-4" />}
                onClick={() =>
                  setActiveSidePanelId((current) =>
                    current ? null : "artifacts",
                  )
                }
                size="icon"
                tooltip={
                  activeSidePanel ? "Hide session panel" : "Open session panel"
                }
                type="button"
                variant={activeSidePanel ? "secondary" : "ghost"}
              />
            )}
          </div>
        </SessionHeader>
        {activeNodeId && (
          <SessionBrowserApprovals
            key={`${user.user_id}/${activeNodeId}`}
            nodeId={activeNodeId}
            userId={user.user_id}
          />
        )}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-auto [overflow-anchor:none] p-3 transition-colors duration-500 sm:p-4",
            usesEncryptedTransport ? "bg-emerald-500/[0.012]" : "bg-canvas",
          )}
          onScroll={handleTimelineScroll}
          data-viewport-scroll
          ref={timelineScrollRef}
        >
          <div className="mx-auto grid w-full max-w-4xl gap-2">
            <div
              className="h-6 text-center text-xs text-ink-tertiary"
              role="status"
            >
              {isFetchingNextHistoryPage ? "Loading earlier messages" : null}
            </div>
            <SessionErrors
              messagesError={historyQuery.error ?? historySync.error}
              missingRouteState={!activeNodeId || !activeAgentId}
              sendError={
                encryptedKeyError ??
                sendError ??
                (usesEncryptedTransport
                  ? encryptedRuntime.error
                  : (queuedTurnQuery.error ?? conversationRun.error))
              }
            />
            {workstreamItems.map((item) => (
              <div className="min-w-0 max-w-full" key={item.id}>
                <WorkstreamItemCard
                  agentOwnerInfos={agentOwnerInfos}
                  item={item}
                  onSelectToolEvidence={handleSelectToolEvidence}
                  permissionDecision={permissionDecision}
                  userId={user.user_id}
                />
              </div>
            ))}
            {isAgentResponsePending && <AgentPendingIndicator />}
            {!historyQuery.isLoading &&
              workstreamItems.length === 0 &&
              !isAgentResponsePending && (
                <div className="rounded-lg border border-dashed border-hairline bg-surface-1 p-4 text-sm text-ink-tertiary">
                  No messages yet. Live tunnel events will appear here.
                </div>
              )}
          </div>
        </div>

        {isExternallyCreatedSession && (
          <div className="border-t border-warning/30 bg-warning/10 px-3 py-2 text-xs text-ink-muted sm:px-4">
            <div className="mx-auto flex w-full max-w-4xl items-start gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <p>
                This session was started outside Pax. You can continue chatting
                here, but messages sent from Pax may not appear in the original
                app.
              </p>
            </div>
          </div>
        )}

        <SessionComposer
          userId={user.user_id}
          availableCommands={
            sessionConfigurationQuery.data?.commands?.available_commands
          }
          activeAgentId={activeAgentId}
          activeNodeId={activeNodeId}
          approvalMode={displayedApprovalMode}
          approvalModePending={
            updateSessionApprovalMode.isPending ||
            updateSessionPermission.isPending
          }
          attachmentError={composerAttachmentError}
          attachmentUploadPending={composerAttachmentUploadPending}
          attachments={composerAttachments}
          currentSessionId={currentSessionId}
          createEmptySessionPending={
            isNewSession && conversationRun.status === "streaming"
          }
          deleteQueuedTurnPending={deleteQueuedTurn.isPending}
          draftKey={composerDraftKey}
          isNewSession={isNewSession}
          isTurnRunning={isTurnRunning}
          showAdminFeatures={showAdminFeatures}
          newSessionCwdInvalid={newSessionCwdInvalid}
          onAddAttachments={handleAddComposerAttachments}
          onCreateEmptySession={isNewSession ? createEmptySession : undefined}
          onDeleteQueuedTurn={handleDeleteQueuedTurn}
          onRemoveAttachment={handleRemoveComposerAttachment}
          onSteer={handleSteerTurn}
          onStop={handleStopTurn}
          onSubmitDraft={submitDraft}
          onSelectPermissionChoice={selectPermissionChoice}
          onToggleApprovalMode={toggleApprovalMode}
          onUpdateQueuedTurn={handleUpdateQueuedTurn}
          queueTurnPending={queueTurn.isPending}
          queuedTurn={queuedTurnQuery.data}
          permissionCatalog={permissionCatalogQuery.data}
          permissionCatalogError={permissionCatalogQuery.isError}
          permissionCatalogLoading={permissionCatalogQuery.isPending}
          permissionChoiceId={displayedPermissionChoiceId}
          permissionChoices={permissionChoices}
          configurationSummary={
            !usesEncryptedTransport
              ? configurationModel(sessionConfigurationQuery.data)
              : undefined
          }
          configurationControl={
            currentSessionId &&
            !usesEncryptedTransport && (
              <SessionConfigSelector
                inline
                configuration={sessionConfigurationQuery.data}
                errorMessage={
                  sessionConfigurationQuery.error instanceof Error
                    ? formatErrorDetail(sessionConfigurationQuery.error)
                    : undefined
                }
                loading={sessionConfigurationQuery.isPending}
                onChange={(configId, value) =>
                  updateSessionConfiguration.mutate({ configId, value })
                }
                onRefresh={() => refreshSessionConfiguration.mutate()}
                pendingOptionId={pendingSessionConfigOptionId}
                refreshing={refreshSessionConfiguration.isPending}
              />
            )
          }
          secure={usesEncryptedTransport}
          steerTurnPending={steerTurn.isPending}
          stopTurnPending={stopTurn.isPending}
          supportsQueuedTurns={!usesEncryptedTransport}
          updateQueuedTurnPending={updateQueuedTurn.isPending}
        />
      </section>

      {activeSidePanel && (
        <button
          type="button"
          aria-label="Close session panel"
          className="absolute inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setActiveSidePanelId(null)}
        />
      )}
      {activeSidePanel && (
        <aside className="absolute inset-x-0 bottom-0 z-30 max-h-[80%] min-h-0 w-full overflow-auto rounded-t-2xl border border-hairline bg-surface-1 shadow-2xl shadow-black/40 lg:relative lg:inset-auto lg:z-auto lg:max-h-full lg:w-[340px] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none">
          <div className="flex min-w-0 items-start justify-between gap-3 border-b border-hairline p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <PanelRight className="h-4 w-4" />
                Session panel
              </div>
            </div>
            <Button
              aria-label={`Hide ${activeSidePanel.label}`}
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
      {browserOpen && activeNodeId && (
        <SessionBrowserWindow
          nodeId={activeNodeId}
          userId={user.user_id}
          onClose={() => setBrowserOpen(false)}
        />
      )}
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
    // Ignore storage cleanup failures; the in-memory handoff is already done.
  }
}

function ArtifactTools({
  artifacts,
  downloadHref,
  isLoading,
  onLoadPreview,
  onRefresh,
  onSelect,
  selectedArtifact,
  selectedArtifactId,
}: {
  artifacts: SessionArtifact[];
  downloadHref: (artifact: SessionArtifact, ref: string) => string;
  isLoading: boolean;
  onLoadPreview: (
    artifact: SessionArtifact,
  ) => Promise<ArtifactPreviewDescriptor>;
  onRefresh: () => void;
  onSelect: (artifactId: string) => void;
  selectedArtifact?: SessionArtifact;
  selectedArtifactId: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex min-w-0 items-center gap-2">
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
        <ArtifactViewerShell
          key={selectedArtifact.artifact_id}
          artifact={artifactDocumentFromSessionArtifact(
            selectedArtifact,
            downloadHref(
              selectedArtifact,
              primaryArtifactContent(selectedArtifact)?.ref ?? "main",
            ),
          )}
          loadPreview={() => onLoadPreview(selectedArtifact)}
          viewerHref={artifactPreviewPageHref(
            "session_artifact",
            selectedArtifact.artifact_id,
            primaryArtifactContent(selectedArtifact)?.ref ?? "main",
          )}
        />
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
            : error
              ? formatErrorDetail(error)
              : ""}
        </TruncatedText>
      </div>
    </div>
  );
}

function InlineError({ error }: { error: Error }) {
  return (
    <TruncatedText className="text-xs text-warning">
      {formatErrorDetail(error)}
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
