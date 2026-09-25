"use client";

import { SessionDraftInput } from "@/components/sessions/session-draft-input";
import { ComposerDropZone } from "@/components/sessions/composer-drop-zone";
import { ComposerAttachmentStatus } from "@/components/sessions/composer-attachment-status";
import Link from "next/link";
import {
  FormEvent,
  KeyboardEvent,
  UIEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  Archive,
  ArchiveRestore,
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Folder,
  Inbox,
  ListFilter,
  LockKeyhole,
  LoaderCircle,
  Menu,
  MessageSquare,
  Paperclip,
  Plus,
  Radio,
  ShieldCheck,
  TerminalSquare,
  Users,
  X,
} from "lucide-react";
import { PaxdGettingStartedGuide } from "@/components/connect/paxd-getting-started";
import { ConsoleLayout } from "@/components/shell/console-layout";
import {
  type ComposerAttachment,
  SessionWorkbench,
} from "@/components/sessions/session-workbench";
import { SecureModeActivation } from "@/components/sessions/secure-mode-activation";
import {
  SessionSettings,
  SessionSettingsHome,
} from "@/components/sessions/session-settings";
import { WorkspacePicker } from "@/components/sessions/workspace-picker";
import { SettingsToggle } from "@/components/ui/settings-controls";
import { SessionPermissionSelector } from "@/components/sessions/session-permission-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TruncatedText } from "@/components/ui/text";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import {
  completeUserAttachment,
  createProjectTarget,
  createUserAttachment,
  listAgents,
  listUserSessions,
  updateAgentSession,
  decideApproval,
  uploadUserAttachmentFile,
  useAgentPermissionCatalog,
  useApprovals,
  useEnvelopes,
  useNodes,
  useProjects,
  useProjectTargets,
  useTeamInvites,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import {
  Agent,
  AgentApproval,
  AgentSession,
  Envelope,
  Node,
  Project,
  SessionApprovalMode,
  TeamInvite,
  User,
} from "@/features/api/types";
import { compactId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { isSupportedSessionWorkspace } from "@/features/runtime/workspace-path";
import {
  PAX_MANUAL_CHOICE_ID,
  approvalModeForPermissionChoice,
  defaultPermissionChoiceId,
  permissionChoicesFromCatalog,
} from "@/features/permissions/permission-catalog";
import { useSessionDeck } from "@/features/session-deck/use-session-deck";
import { useConsoleStore } from "@/stores/console-store";

type FleetOverviewProps = {
  user: User;
};

type WorkItemKind =
  | "approval"
  | "envelope"
  | "inquiry"
  | "invite"
  | "session"
  | "system";
type ComposerMode = "clean" | "comment-draft" | "summarize-note";
type InquiryState = "draft-ready" | "needs-draft" | "needs-summary";

type InquiryTurn = {
  body: string;
  speaker: string;
};

type WorkItem = {
  approval?: AgentApproval;
  actionHref?: string;
  actionLabel: string;
  agentId?: string;
  archivedAt?: string;
  background?: string;
  context: string;
  createdAt?: string;
  detail: string;
  draft?: string;
  href: string;
  id: string;
  inquiryState?: InquiryState;
  kind: WorkItemKind;
  nodeId?: string;
  primaryProjectId?: string;
  runStatus?: string;
  ownerAlias?: string;
  priority: "high" | "medium" | "low";
  question?: string;
  conversationTurns?: InquiryTurn[];
  sessionId?: string;
  source: string;
  title: string;
  transport?: AgentSession["transport"];
};

type EmbeddedSessionTarget = {
  agentId?: string;
  initialApprovalMode?: SessionApprovalMode;
  initialPermissionChoiceId?: string;
  initialAttachments?: ComposerAttachment[];
  initialCwd?: string;
  initialInitializeOnly?: boolean;
  initialPrompt?: string;
  initialTransport?: AgentSession["transport"];
  key: string;
  nodeId?: string;
  primaryProjectId?: string;
  projectTargetId?: string;
  saveWorkspaceTarget?: boolean;
  sessionId: string;
};

const homeSessionPageSize = 20;
const nextSessionPageScrollOffset = 240;

const kindIcon: Record<WorkItemKind, React.ReactNode> = {
  approval: <ShieldCheck className="h-4 w-4" />,
  envelope: <Inbox className="h-4 w-4" />,
  inquiry: <MessageSquare className="h-4 w-4" />,
  invite: <Users className="h-4 w-4" />,
  session: <TerminalSquare className="h-4 w-4" />,
  system: <Radio className="h-4 w-4" />,
};

export function FleetOverview({ user }: FleetOverviewProps) {
  const queryClient = useQueryClient();
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const showAdminFeatures = canSeeAdminFeatures(user, previewAsUser);
  const searchParams = useSearchParams();
  const composerFileInputRef = useRef<HTMLInputElement>(null);
  const persistedTargetSessionIdsRef = useRef(new Set<string>());
  const canonicalUrlSessionId = searchParams.get("session_id") ?? "";
  const legacyUrlSessionId = searchParams.get("sessionId") ?? "";
  const urlSessionId = canonicalUrlSessionId || legacyUrlSessionId;
  const [composerMode, setComposerMode] = useState<ComposerMode>("clean");
  const homeDraftKey = `home:${user.user_id}`;
  const setComposerDraft = useConsoleStore((state) => state.setComposerDraft);
  const setDraft = (value: string) => setComposerDraft(homeDraftKey, value);
  const [generatedDrafts, setGeneratedDrafts] = useState<
    Record<string, string>
  >({});
  const [workspaceDraft, setWorkspaceDraft] = useState<{
    key: string;
    cwd: string;
    save?: boolean;
  } | null>(null);
  const [newSessionTransport, setNewSessionTransport] =
    useState<NonNullable<AgentSession["transport"]>>("manager");
  const [
    newSessionPermissionChoiceByAgent,
    setNewSessionPermissionChoiceByAgent,
  ] = useState<Record<string, string>>({});
  const [attachmentName, setAttachmentName] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<
    ComposerAttachment[]
  >([]);
  const [composerAttachmentError, setComposerAttachmentError] =
    useState<Error | null>(null);
  const [composerAttachmentUploadPending, setComposerAttachmentUploadPending] =
    useState(false);
  const attachmentUploadRef = useRef(false);
  const [projectTargetSaveError, setProjectTargetSaveError] =
    useState<Error | null>(null);
  const [archivedWorkItemIds, setArchivedWorkItemIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [mobileComposerOpen, setMobileComposerOpen] = useState(true);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const creationStartedAtRef = useRef(-Infinity);
  const creationPendingRef = useRef(false);
  const { rememberSession, dismissSession: dismissDeckSession } =
    useSessionDeck(user.user_id);
  const [contextClosed, setContextClosed] = useState(false);
  const [sessionAgentFilters, setSessionAgentFilters] = useState<string[]>([]);
  const [sessionNodeFilters, setSessionNodeFilters] = useState<string[]>([]);
  const [sessionProjectFilter, setSessionProjectFilter] = useState("");
  const [includeArchivedSessions, setIncludeArchivedSessions] = useState(false);
  const [sessionFilterMenuOpen, setSessionFilterMenuOpen] = useState(false);
  const [embeddedSessionTarget, setEmbeddedSessionTarget] =
    useState<EmbeddedSessionTarget | null>(() =>
      urlSessionId
        ? {
            key: `url:${urlSessionId}`,
            sessionId: urlSessionId,
          }
        : null,
    );
  const [selectedWorkItemId, setSelectedWorkItemId] = useState("");

  const nodesQuery = useNodes(user.user_id);
  const nodes = sortOnlineFirst(
    nodesQuery.data?.nodes ?? [],
    (node) => node.online,
    (node) => node.name ?? node.hostname ?? node.node_id,
  );
  const agentsQuery = useQuery({
    queryKey: queryKeys.userAgents(user.user_id),
    queryFn: () => listAgents(user.user_id),
    enabled: Boolean(user.user_id),
  });
  const discoveredAgents = sortOnlineFirst(
    agentsQuery.data?.agents ?? [],
    (agent) => agent.online,
    agentLabel,
  );
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const sessionAgentFilterOptions = useMemo(
    () => buildSessionAgentFilterOptions(discoveredAgents, nodes),
    [discoveredAgents, nodes],
  );
  const sessionNodeFilterOptions = useMemo(
    () => buildSessionNodeFilterOptions(nodes),
    [nodes],
  );
  const effectiveSessionAgentFilters = useMemo(
    () =>
      sessionAgentFilters.filter((value) =>
        sessionAgentFilterOptions.some((option) => option.value === value),
      ),
    [sessionAgentFilterOptions, sessionAgentFilters],
  );
  const effectiveSessionNodeFilters = useMemo(
    () =>
      sessionNodeFilters.filter((value) =>
        sessionNodeFilterOptions.some((option) => option.value === value),
      ),
    [sessionNodeFilterOptions, sessionNodeFilters],
  );
  const sessionsQuery = useInfiniteQuery({
    queryKey: queryKeys.userSessions(user.user_id, {
      agentIds: effectiveSessionAgentFilters,
      includeArchived: includeArchivedSessions,
      nodeIds: effectiveSessionNodeFilters,
      pageSize: homeSessionPageSize,
      primaryProjectId: sessionProjectFilter || undefined,
    }),
    queryFn: ({ pageParam }) =>
      listUserSessions(user.user_id, {
        agentIds: effectiveSessionAgentFilters,
        includeArchived: includeArchivedSessions,
        nodeIds: effectiveSessionNodeFilters,
        pageNum: pageParam,
        pageSize: homeSessionPageSize,
        primaryProjectId: sessionProjectFilter || undefined,
      }),
    enabled: Boolean(user.user_id),
    getNextPageParam: (lastPage) => {
      const pagination = lastPage.pagination;
      if (!pagination?.total_pages) {
        return undefined;
      }
      return pagination.page_num < pagination.total_pages
        ? pagination.page_num + 1
        : undefined;
    },
    initialPageParam: 1,
    refetchInterval: 15_000,
    refetchOnWindowFocus: "always",
  });
  const queriedSessions = useMemo(
    () =>
      dedupeSessionsById(
        sessionsQuery.data?.pages.flatMap((page) => page.sessions) ?? [],
      ),
    [sessionsQuery.data?.pages],
  );
  const latestSessionTimeByAgent = useMemo(
    () => latestSessionMessageTimeByAgent(queriedSessions),
    [queriedSessions],
  );
  const agents = sortAgentsForHome(discoveredAgents, latestSessionTimeByAgent);
  const needsOnboarding =
    !nodesQuery.isLoading &&
    !agentsQuery.isLoading &&
    (nodes.length === 0 || agents.length === 0);
  const projectsQuery = useProjects(user.user_id);
  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects],
  );
  const projectTargetsQuery = useProjectTargets(
    user.user_id,
    selectedProjectId,
  );
  const enabledProjectTargets = useMemo(
    () =>
      (projectTargetsQuery.data?.targets ?? []).filter(
        (target) => target.enabled,
      ),
    [projectTargetsQuery.data?.targets],
  );
  const activeAgent =
    agents.find((agent) => agent.agent_id === selectedAgentId) ?? agents[0];
  const permissionCatalogQuery = useAgentPermissionCatalog(
    user.user_id,
    activeAgent?.agent_id,
  );
  const newSessionPermissionChoices = useMemo(
    () => permissionChoicesFromCatalog(permissionCatalogQuery.data),
    [permissionCatalogQuery.data],
  );
  const newSessionPermissionChoiceId = activeAgent?.agent_id
    ? newSessionPermissionChoiceByAgent[activeAgent.agent_id]
    : undefined;
  const effectiveNewSessionPermissionChoiceId =
    newSessionPermissionChoiceId === PAX_MANUAL_CHOICE_ID ||
    newSessionPermissionChoices.some(
      (choice) => choice.choice_id === newSessionPermissionChoiceId,
    )
      ? (newSessionPermissionChoiceId as string)
      : defaultPermissionChoiceId(
          newSessionPermissionChoices,
          "manual",
          permissionCatalogQuery.data?.default_choice_id,
        );
  const effectiveNewSessionApprovalMode = approvalModeForPermissionChoice(
    effectiveNewSessionPermissionChoiceId,
  );
  const workspaceKey = JSON.stringify([
    selectedProjectId,
    activeAgent?.agent_id ?? "",
  ]);
  const suggestedProjectTargets = useMemo(
    () =>
      selectedProjectId
        ? enabledProjectTargets.filter(
            (target) => target.agent_id === activeAgent?.agent_id,
          )
        : [],
    [selectedProjectId, enabledProjectTargets, activeAgent?.agent_id],
  );
  const defaultWorkspace =
    suggestedProjectTargets.find((target) => target.is_default) ??
    (suggestedProjectTargets.length === 1
      ? suggestedProjectTargets[0]
      : undefined);
  const workspaceLoading = Boolean(
    selectedProjectId && projectTargetsQuery.isPending,
  );
  const newSessionCwd =
    workspaceDraft?.key === workspaceKey
      ? workspaceDraft.cwd
      : (defaultWorkspace?.cwd ?? "");
  const normalizedNewSessionCwd = newSessionCwd.trim();
  const newSessionCwdInvalid =
    normalizedNewSessionCwd.length > 0 &&
    !isSupportedSessionWorkspace(normalizedNewSessionCwd);
  const matchingProjectTarget = suggestedProjectTargets.find(
    (target) => target.cwd === normalizedNewSessionCwd,
  );

  const sessions = useMemo(
    () => byRecent(queriedSessions, sessionTimestamp),
    [queriedSessions],
  );
  const approvalsQuery = useApprovals(user.user_id);
  const envelopesQuery = useEnvelopes(user.user_id, {
    direction: "received",
    status: "pending",
  });
  const invitesQuery = useTeamInvites(user.user_id);
  const showMockInquiries = showAdminFeatures;

  const workItems = useMemo(
    () =>
      buildWorkItems({
        agents,
        approvals: approvalsQuery.data?.approvals ?? [],
        envelopes: envelopesQuery.data?.envelopes ?? [],
        invites: invitesQuery.data?.invites ?? [],
        nodes,
        showMockInquiries,
        sessions,
      }),
    [
      agents,
      approvalsQuery.data?.approvals,
      envelopesQuery.data?.envelopes,
      invitesQuery.data?.invites,
      nodes,
      showMockInquiries,
      sessions,
    ],
  );
  const activeWorkItems = useMemo(
    () => removeArchivedWorkItems(workItems, archivedWorkItemIds),
    [archivedWorkItemIds, workItems],
  );
  const visibleWorkItems = useMemo(
    () =>
      filterSessionWorkItems(
        activeWorkItems,
        effectiveSessionAgentFilters,
        effectiveSessionNodeFilters,
      ),
    [
      activeWorkItems,
      effectiveSessionAgentFilters,
      effectiveSessionNodeFilters,
    ],
  );
  const selectedWorkItem = selectedWorkItemId
    ? activeWorkItems.find((item) => item.id === selectedWorkItemId)
    : undefined;
  const composerContextItem =
    contextClosed || !selectedWorkItem ? undefined : selectedWorkItem;
  const selectedGeneratedDraft = composerContextItem
    ? generatedDrafts[composerContextItem.id]
    : undefined;
  const selectedInquiry =
    composerContextItem?.kind === "inquiry" ? composerContextItem : undefined;
  const selectedSession =
    selectedWorkItem?.kind === "session" ? selectedWorkItem : undefined;
  const selectedSessionTarget: EmbeddedSessionTarget | null =
    selectedSession?.sessionId
      ? {
          agentId: selectedSession.agentId,
          key: `${selectedSession.sessionId}:${selectedSession.nodeId ?? ""}:${selectedSession.agentId ?? ""}`,
          nodeId: selectedSession.nodeId,
          sessionId: selectedSession.sessionId,
        }
      : null;
  const resolvedEmbeddedSessionTarget = embeddedSessionTarget
    ? resolveEmbeddedSessionTarget(embeddedSessionTarget, activeWorkItems)
    : null;
  const activeSessionTarget =
    selectedSessionTarget || resolvedEmbeddedSessionTarget;
  const activeSessionTargetPending =
    Boolean(activeSessionTarget) &&
    activeSessionTarget?.sessionId !== "new" &&
    (!activeSessionTarget?.nodeId || !activeSessionTarget?.agentId);
  const updateSessionArchived = useMutation({
    mutationFn: async (item: WorkItem) => {
      if (!item.nodeId || !item.agentId || !item.sessionId) {
        throw new Error("Session archive target is incomplete.");
      }
      const archived = !item.archivedAt;
      const session = await updateAgentSession(
        user.user_id,
        item.nodeId,
        item.agentId,
        item.sessionId,
        { archived },
      );
      return { archived, item, session };
    },
    onSuccess: ({ archived, item }) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.userSessionsRoot(user.user_id),
      });
      if (item.nodeId && item.agentId) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.sessions(user.user_id, item.nodeId, item.agentId),
        });
      }
      if (archived && item.sessionId) {
        dismissDeckSession(item.sessionId);
        if (activeSessionTarget?.sessionId === item.sessionId) {
          showCleanComposer();
        }
      }
    },
  });
  const apiError =
    nodesQuery.error ??
    agentsQuery.error ??
    projectsQuery.error ??
    projectTargetsQuery.error ??
    projectTargetSaveError ??
    sessionsQuery.error ??
    updateSessionArchived.error ??
    approvalsQuery.error ??
    envelopesQuery.error ??
    invitesQuery.error ??
    null;
  const fleetSetupGuideKind =
    nodes.length === 0 ? "node" : agents.length === 0 ? "agent" : null;
  const mobileDetailOpen = Boolean(
    activeSessionTarget || composerContextItem || selectedProjectId,
  );
  const mobilePaneOpen = mobileDetailOpen || mobileComposerOpen;
  const secureComposerActive =
    !activeSessionTarget && newSessionTransport === "e2ee";

  useEffect(() => {
    if (!canonicalUrlSessionId && legacyUrlSessionId) {
      replaceHomeSessionUrl(legacyUrlSessionId);
    }
  }, [canonicalUrlSessionId, legacyUrlSessionId]);

  useEffect(() => {
    if (!canonicalUrlSessionId && legacyUrlSessionId) {
      replaceHomeSessionUrl(legacyUrlSessionId);
    }
  }, [canonicalUrlSessionId, legacyUrlSessionId]);

  useEffect(() => {
    if (
      !urlSessionId ||
      !activeSessionTargetPending ||
      !sessionsQuery.hasNextPage ||
      sessionsQuery.isFetchingNextPage
    ) {
      return;
    }

    void sessionsQuery.fetchNextPage();
  }, [
    activeSessionTargetPending,
    sessionsQuery,
    sessionsQuery.hasNextPage,
    sessionsQuery.isFetchingNextPage,
    urlSessionId,
  ]);

  useEffect(() => {
    const sessionId = activeSessionTarget?.sessionId;
    if (sessionId && sessionId !== "new") {
      rememberSession(sessionId);
    }
  }, [activeSessionTarget?.sessionId, rememberSession]);

  function loadMoreSessions() {
    if (
      !sessionsQuery.hasNextPage ||
      sessionsQuery.isFetchingNextPage ||
      sessionsQuery.isLoading
    ) {
      return;
    }
    void sessionsQuery.fetchNextPage();
  }

  function handleRailScroll(event: UIEvent<HTMLElement>) {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    if (
      scrollHeight - scrollTop - clientHeight <=
      nextSessionPageScrollOffset
    ) {
      loadMoreSessions();
    }
  }

  function openSessionItem(item: WorkItem) {
    if (!item.sessionId) {
      return;
    }
    rememberSession(item.sessionId);
    setEmbeddedSessionTarget(null);
    setSelectedProjectId(item.primaryProjectId ?? "");
    replaceHomeSessionUrl(item.sessionId);
    setSelectedWorkItemId(item.id);
    setMobileComposerOpen(false);
    setMobileRailOpen(false);
    setContextClosed(false);
    setComposerMode("clean");
    setNewSessionTransport("manager");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = useConsoleStore.getState().composerDrafts[homeDraftKey] ?? "";
    if (composerMode === "summarize-note" && selectedInquiry) {
      setGeneratedDrafts((current) => ({
        ...current,
        [selectedInquiry.id]: draftFromInquiry(selectedInquiry, draft),
      }));
      setComposerMode("clean");
      setDraft("");
      return;
    }

    if (composerMode === "comment-draft" && selectedInquiry) {
      setComposerMode("clean");
      setDraft("");
      return;
    }

    if (
      !activeAgent?.agent_id ||
      !activeAgent.node_id ||
      (selectedProjectId && !normalizedNewSessionCwd) ||
      workspaceLoading ||
      newSessionCwdInvalid ||
      composerAttachmentUploadPending
    ) {
      return;
    }

    const nonce = Date.now();
    if (
      creationPendingRef.current ||
      nonce - creationStartedAtRef.current < 500
    )
      return;
    creationPendingRef.current = true;
    creationStartedAtRef.current = nonce;
    const initialPrompt = draft.trim();
    setProjectTargetSaveError(null);
    setEmbeddedSessionTarget({
      agentId: activeAgent.agent_id,
      initialApprovalMode: effectiveNewSessionApprovalMode,
      initialPermissionChoiceId: effectiveNewSessionPermissionChoiceId,
      initialAttachments: composerAttachments,
      initialCwd: normalizedNewSessionCwd || undefined,
      initialPrompt: initialPrompt || undefined,
      initialInitializeOnly: !initialPrompt && composerAttachments.length === 0,
      saveWorkspaceTarget:
        workspaceDraft?.key === workspaceKey && Boolean(workspaceDraft.save),
      initialTransport: newSessionTransport,
      key: `new:${nonce}`,
      nodeId: activeAgent.node_id,
      primaryProjectId: selectedProjectId || undefined,
      projectTargetId: matchingProjectTarget?.target_id,
      sessionId: "new",
    });
    clearHomeSessionUrl();
    setMobileComposerOpen(false);
    setMobileRailOpen(false);
    setSelectedWorkItemId("");
    setContextClosed(false);
    setComposerMode("clean");
    setDraft("");
    setNewSessionTransport("manager");
    setComposerAttachments([]);
    setComposerAttachmentError(null);
  }

  async function addComposerAttachments(files: File[]) {
    if (
      files.length === 0 ||
      attachmentUploadRef.current ||
      newSessionTransport === "e2ee"
    ) {
      return;
    }

    attachmentUploadRef.current = true;
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
      attachmentUploadRef.current = false;
      setComposerAttachmentUploadPending(false);
    }
  }

  function showCleanComposer() {
    creationPendingRef.current = false;
    const targetAgentId =
      activeSessionTarget?.agentId ??
      (effectiveSessionAgentFilters.length === 1
        ? effectiveSessionAgentFilters[0]
        : undefined);

    if (targetAgentId) {
      setSelectedAgentId(targetAgentId);
    }

    setEmbeddedSessionTarget(null);
    clearHomeSessionUrl();
    setSelectedProjectId("");
    setMobileComposerOpen(true);
    setMobileRailOpen(false);
    setSelectedWorkItemId("");
    setContextClosed(false);
    setComposerMode("clean");
    setDraft("");
    setNewSessionTransport("manager");
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
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <ConsoleLayout user={user}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
        {apiError && <ApiState error={apiError} />}

        <main className="relative grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          {mobilePaneOpen && mobileRailOpen && (
            <button
              aria-label="Close Home sidebar"
              className="absolute inset-0 z-20 bg-black/50 lg:hidden"
              onClick={() => setMobileRailOpen(false)}
              type="button"
            />
          )}
          <section
            className={cn(
              "min-h-0 flex-col overflow-hidden border-b border-hairline bg-surface-1 lg:static lg:z-auto lg:flex lg:w-auto lg:border-b-0 lg:border-r lg:shadow-none",
              mobilePaneOpen
                ? mobileRailOpen
                  ? "absolute inset-y-0 left-0 z-30 flex w-[min(82vw,320px)] shadow-2xl shadow-black/50"
                  : "hidden"
                : "flex",
            )}
          >
            <div className="shrink-0 border-b border-hairline bg-surface-1 px-4 py-3">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <Button
                  asChild
                  icon={<Plus className="h-4 w-4" />}
                  variant="ghost"
                >
                  <Link
                    href="/sessions/new"
                    onClick={(event) => {
                      if (
                        event.button !== 0 ||
                        event.metaKey ||
                        event.ctrlKey ||
                        event.shiftKey ||
                        event.altKey
                      )
                        return;
                      event.preventDefault();
                      showCleanComposer();
                    }}
                  >
                    New session
                  </Link>
                </Button>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label="Close sidebar"
                    className="lg:hidden"
                    icon={<X className="h-4 w-4" />}
                    onClick={() => setMobileRailOpen(false)}
                    size="icon"
                    variant="ghost"
                    type="button"
                  />
                  <SessionFilterMenu
                    agentOptions={sessionAgentFilterOptions}
                    includeArchived={includeArchivedSessions}
                    nodeOptions={sessionNodeFilterOptions}
                    onAgentToggle={(value) =>
                      setSessionAgentFilters((current) =>
                        toggleFilterValue(current, value),
                      )
                    }
                    onClearAgents={() => setSessionAgentFilters([])}
                    onClearNodes={() => setSessionNodeFilters([])}
                    onIncludeArchivedChange={setIncludeArchivedSessions}
                    onNodeToggle={(value) =>
                      setSessionNodeFilters((current) =>
                        toggleFilterValue(current, value),
                      )
                    }
                    onOpenChange={setSessionFilterMenuOpen}
                    open={sessionFilterMenuOpen}
                    selectedAgents={effectiveSessionAgentFilters}
                    selectedNodes={effectiveSessionNodeFilters}
                  />
                </div>
              </div>
            </div>
            <ProjectSessionRail
              activeSessionId={activeSessionTarget?.sessionId}
              hasMore={Boolean(sessionsQuery.hasNextPage)}
              onLoadMore={loadMoreSessions}
              onProjectFilterChange={(projectId) => {
                // The query can reorder recent agents; keep creation context.
                if (activeAgent) setSelectedAgentId(activeAgent.agent_id);
                // Filtering the rail must not unmount the open conversation.
                if (activeSessionTarget) {
                  setEmbeddedSessionTarget(activeSessionTarget);
                }
                setSessionProjectFilter(projectId);
              }}
              onScroll={handleRailScroll}
              loadingMore={sessionsQuery.isFetchingNextPage}
              loading={projectsQuery.isLoading || sessionsQuery.isLoading}
              onSelectSession={(item) => {
                openSessionItem(item);
              }}
              onSetArchived={(item) => updateSessionArchived.mutate(item)}
              archivePendingId={updateSessionArchived.variables?.id}
              projects={projects}
              projectFilter={sessionProjectFilter}
              sessions={visibleWorkItems}
            />
          </section>

          <section
            data-secure-mode={secureComposerActive}
            data-testid="home-composer-pane"
            className={cn(
              "relative isolate min-h-0 min-w-0 flex-col overflow-hidden transition-[background,box-shadow] duration-500 ease-out",
              mobilePaneOpen ? "flex" : "hidden lg:flex",
              secureComposerActive
                ? "bg-[radial-gradient(circle_at_50%_105%,rgba(16,185,129,0.075),transparent_48%),linear-gradient(180deg,rgba(16,185,129,0.025),transparent_36%)] shadow-[inset_0_-1px_0_rgba(52,211,153,0.08)]"
                : "bg-canvas",
            )}
          >
            {secureComposerActive && <SecureModeActivation />}
            {activeSessionTargetPending ? (
              <section className="flex min-h-0 flex-1 items-center justify-center p-5 text-sm text-ink-tertiary">
                Loading session...
              </section>
            ) : activeSessionTarget ? (
              <SessionWorkbench
                agentId={activeSessionTarget.agentId}
                embedded
                initialApprovalMode={activeSessionTarget.initialApprovalMode}
                initialPermissionChoiceId={
                  activeSessionTarget.initialPermissionChoiceId
                }
                initialAttachments={activeSessionTarget.initialAttachments}
                initialCwd={activeSessionTarget.initialCwd}
                initialInitializeOnly={
                  activeSessionTarget.initialInitializeOnly
                }
                initialPrimaryProjectId={activeSessionTarget.primaryProjectId}
                initialPrompt={activeSessionTarget.initialPrompt}
                initialProjectTargetId={activeSessionTarget.projectTargetId}
                initialTransport={activeSessionTarget.initialTransport}
                key={activeSessionTarget.key}
                mobileMenuLabel="Chat sidebar"
                nodeId={activeSessionTarget.nodeId}
                onMobileMenu={() => setMobileRailOpen(true)}
                onSessionAssigned={(sessionId) => {
                  creationPendingRef.current = false;
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.userSessionsRoot(user.user_id),
                  });
                  if (
                    activeSessionTarget.sessionId === "new" &&
                    activeSessionTarget.saveWorkspaceTarget &&
                    activeSessionTarget.primaryProjectId &&
                    activeSessionTarget.agentId &&
                    activeSessionTarget.initialCwd &&
                    !activeSessionTarget.projectTargetId &&
                    !persistedTargetSessionIdsRef.current.has(sessionId)
                  ) {
                    const projectId = activeSessionTarget.primaryProjectId;
                    persistedTargetSessionIdsRef.current.add(sessionId);
                    void createProjectTarget(user.user_id, projectId, {
                      agent_id: activeSessionTarget.agentId,
                      cwd: activeSessionTarget.initialCwd,
                    })
                      .then(() =>
                        queryClient.invalidateQueries({
                          queryKey: queryKeys.projectTargets(
                            user.user_id,
                            projectId,
                          ),
                        }),
                      )
                      .catch((caught) => {
                        persistedTargetSessionIdsRef.current.delete(sessionId);
                        setProjectTargetSaveError(
                          caught instanceof Error
                            ? caught
                            : new Error(String(caught)),
                        );
                      });
                  }
                  const nextTarget = {
                    ...activeSessionTarget,
                    sessionId,
                  };
                  setEmbeddedSessionTarget(nextTarget);
                  rememberSession(sessionId);
                  replaceHomeSessionUrl(sessionId);
                }}
                sessionId={activeSessionTarget.sessionId}
                user={user}
              />
            ) : fleetSetupGuideKind ? (
              <div className="flex min-h-0 flex-1 items-center overflow-auto p-3 sm:p-5">
                <div className="mx-auto w-full max-w-4xl">
                  <PaxdGettingStartedGuide kind={fleetSetupGuideKind} />
                </div>
              </div>
            ) : (
              <>
                <div className="grid min-w-0 gap-1 border-b border-hairline bg-surface-1 px-5 py-2 sm:px-6">
                  <div className="flex min-w-0 items-center gap-2">
                    <Button
                      aria-label="Open Home sidebar"
                      className="lg:hidden"
                      icon={<Menu className="h-4 w-4" />}
                      onClick={() => setMobileRailOpen(true)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    />
                    <label className="relative inline-flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent bg-transparent px-2 text-sm text-ink-muted focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/25 active:bg-surface-3">
                      <Folder className="h-4 w-4 shrink-0" />
                      <span className="hidden shrink-0 text-xs font-medium text-ink-tertiary sm:inline">
                        Project
                      </span>
                      <select
                        aria-label="Project"
                        className="min-h-9 min-w-0 flex-1 appearance-none truncate bg-transparent pr-6 text-base text-ink outline-none [color-scheme:dark] sm:text-sm"
                        onChange={(event) => {
                          const projectId = event.target.value;
                          setSelectedProjectId(projectId);
                          setProjectTargetSaveError(null);
                        }}
                        value={selectedProjectId}
                      >
                        <option value="">Project</option>
                        {projects.map((project) => (
                          <option
                            key={project.project_id}
                            value={project.project_id}
                          >
                            {projectPath(project, projects)
                              .map((item) => item.display_name)
                              .join(" / ")}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        aria-hidden="true"
                        className="pointer-events-none absolute right-2 h-4 w-4 shrink-0 text-ink-muted"
                      />
                    </label>
                    <AgentSelector
                      agents={agents}
                      nodes={nodes}
                      selectedAgentId={activeAgent?.agent_id}
                      onChange={setSelectedAgentId}
                    />
                  </div>
                  <WorkspacePicker
                    key={workspaceKey}
                    value={newSessionCwd}
                    loading={workspaceLoading}
                    disabled={!activeAgent}
                    canSave={Boolean(selectedProjectId)}
                    targets={suggestedProjectTargets}
                    save={
                      workspaceDraft?.key === workspaceKey &&
                      Boolean(workspaceDraft.save)
                    }
                    onChange={(cwd, save) =>
                      setWorkspaceDraft({ key: workspaceKey, cwd, save })
                    }
                  />
                </div>
                <div
                  className="flex min-h-0 flex-1 items-center overflow-auto p-3 sm:p-5"
                  data-viewport-scroll
                >
                  <div className="mx-auto grid w-full max-w-4xl gap-4">
                    {needsOnboarding && (
                      <section className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm">
                        <div className="font-medium text-ink">
                          Connect a device to start chatting
                        </div>
                        <p className="mt-1 leading-6 text-ink-muted">
                          Register a node, install paxd, and start an agent
                          connection. Your available agents will appear here
                          automatically.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Link
                            className="inline-flex min-h-9 items-center rounded-md border border-primary bg-primary px-3 font-medium text-canvas hover:bg-primary-hover"
                            href="/settings/developer?view=node-registration"
                          >
                            Register a node
                          </Link>
                          <Link
                            className="inline-flex min-h-9 items-center rounded-md border border-hairline bg-surface-2 px-3 text-ink-muted hover:bg-surface-3 hover:text-ink"
                            href="/settings/devices"
                          >
                            Open Devices
                          </Link>
                        </div>
                      </section>
                    )}
                    <motion.div
                      animate={{ opacity: 1, y: 0 }}
                      initial={{ opacity: 0, y: 8 }}
                      key={composerContextItem?.id ?? "empty"}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <SelectedContext
                        generatedDraft={selectedGeneratedDraft}
                        item={composerContextItem}
                        onArchive={() => {
                          if (composerContextItem) {
                            setArchivedWorkItemIds((current) => [
                              ...current,
                              composerContextItem.id,
                            ]);
                          }
                          setContextClosed(false);
                          setAttachmentName("");
                          setComposerMode("clean");
                          setDraft("");
                        }}
                        onCommentOnDraft={() => {
                          setComposerMode("comment-draft");
                          setDraft("");
                        }}
                        onClose={() => {
                          setContextClosed(true);
                          setSelectedWorkItemId("");
                          setAttachmentName("");
                          setComposerMode("clean");
                          setDraft("");
                        }}
                        onGenerateDraft={() => {
                          if (selectedInquiry) {
                            setGeneratedDrafts((current) => ({
                              ...current,
                              [selectedInquiry.id]: draftFromInquiry(
                                selectedInquiry,
                                "",
                              ),
                            }));
                          }
                        }}
                        onSummarizeWithNote={() => {
                          setComposerMode("summarize-note");
                          setDraft("");
                        }}
                        user={user}
                      />
                    </motion.div>
                  </div>
                </div>

                <form
                  className={cn(
                    "mobile-safe-bottom border-t p-3 transition-[background-color,border-color] duration-500",
                    secureComposerActive
                      ? "border-emerald-400/20 bg-emerald-500/[0.035] backdrop-blur-xl"
                      : "border-hairline bg-surface-1",
                  )}
                  onSubmit={submit}
                >
                  <ComposerDropZone
                    disabledReason={
                      secureComposerActive
                        ? "Attachments aren’t available in encrypted sessions yet"
                        : composerAttachmentUploadPending
                          ? "Upload in progress"
                          : undefined
                    }
                    onFiles={addComposerAttachments}
                    className={cn(
                      "mx-auto w-full max-w-4xl rounded-[22px] border px-3 py-2 transition-[background-color,border-color,box-shadow] duration-500",
                      secureComposerActive
                        ? "border-emerald-400/45 bg-surface-2/95 shadow-[0_0_0_1px_rgba(52,211,153,0.04),0_10px_36px_rgba(16,185,129,0.07)] focus-within:border-emerald-400/70 focus-within:shadow-[0_0_0_3px_rgba(52,211,153,0.08),0_14px_44px_rgba(16,185,129,0.10)]"
                        : "border-hairline bg-surface-2 focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/20",
                    )}
                  >
                    <ComposerModeHint
                      secure={secureComposerActive}
                      mode={composerMode}
                      onClear={() => {
                        setComposerMode("clean");
                        setDraft("");
                      }}
                    />
                    <input
                      className="sr-only"
                      disabled={
                        secureComposerActive || composerAttachmentUploadPending
                      }
                      multiple
                      onChange={(event) => {
                        const files = [...(event.currentTarget.files ?? [])];
                        if (files.length > 0) {
                          void addComposerAttachments(files);
                        }
                        event.currentTarget.value = "";
                      }}
                      ref={composerFileInputRef}
                      type="file"
                    />
                    {composerAttachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {composerAttachments.map((attachment) => (
                          <Badge
                            className="max-w-full"
                            key={attachment.attachmentId}
                            tooltip={attachment.filename}
                          >
                            <span className="max-w-44 truncate">
                              {attachment.filename}
                            </span>
                            <button
                              aria-label={`Remove ${attachment.filename}`}
                              className="ml-1 shrink-0 text-ink-tertiary transition hover:text-ink"
                              onClick={() => {
                                setComposerAttachments((current) =>
                                  current.filter(
                                    (item) =>
                                      item.attachmentId !==
                                      attachment.attachmentId,
                                  ),
                                );
                                setComposerAttachmentError(null);
                              }}
                              type="button"
                            >
                              ×
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <ComposerAttachmentStatus
                      uploading={composerAttachmentUploadPending}
                      error={composerAttachmentError}
                      onDismissError={() => setComposerAttachmentError(null)}
                    />
                    <SessionDraftInput
                      draftKey={homeDraftKey}
                      className="max-h-40 min-h-10 w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-base leading-6 text-ink outline-none [field-sizing:content] placeholder:text-ink-tertiary sm:text-sm sm:leading-5"
                      enterKeyHint="send"
                      onKeyDown={handleComposerKeyDown}
                      placeholder={
                        secureComposerActive
                          ? "Send an end-to-end encrypted message"
                          : composerPlaceholder(composerMode)
                      }
                      rows={1}
                    />
                    <div className="flex min-w-0 items-center gap-1 sm:gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label="Upload files"
                            disabled={
                              composerAttachmentUploadPending ||
                              newSessionTransport === "e2ee"
                            }
                            icon={
                              composerAttachmentUploadPending ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )
                            }
                            size="icon"
                            tooltip={
                              newSessionTransport === "e2ee"
                                ? "Attachments are not supported in encrypted sessions yet"
                                : "Upload files"
                            }
                            type="button"
                            variant="ghost"
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="w-36"
                          side="top"
                        >
                          <DropdownMenuItem
                            onSelect={() =>
                              composerFileInputRef.current?.click()
                            }
                          >
                            <Paperclip className="h-4 w-4" />
                            Upload
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <SessionSettings
                        summary={[
                          secureComposerActive ? "Encrypted" : undefined,
                          newSessionPermissionChoices.find(
                            (choice) =>
                              choice.choice_id ===
                              effectiveNewSessionPermissionChoiceId,
                          )?.label ?? "Ask",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        <SessionSettingsHome>
                          <SettingsToggle
                            label="End-to-end encryption"
                            ariaLabel="Use end-to-end encryption"
                            checked={newSessionTransport === "e2ee"}
                            disabled={
                              composerAttachments.length > 0 ||
                              composerAttachmentUploadPending
                            }
                            description={
                              composerAttachmentUploadPending
                                ? "Wait for the upload to finish"
                                : composerAttachments.length > 0
                                  ? "Remove attachments before enabling encryption"
                                  : undefined
                            }
                            onChange={(checked) =>
                              setNewSessionTransport(
                                checked ? "e2ee" : "manager",
                              )
                            }
                          />
                        </SessionSettingsHome>
                        <SessionPermissionSelector
                          field
                          catalog={permissionCatalogQuery.data}
                          choices={newSessionPermissionChoices}
                          error={permissionCatalogQuery.isError}
                          loading={permissionCatalogQuery.isPending}
                          onChange={(choiceId) => {
                            if (!activeAgent?.agent_id) {
                              return;
                            }
                            setNewSessionPermissionChoiceByAgent((current) => ({
                              ...current,
                              [activeAgent.agent_id]: choiceId,
                            }));
                          }}
                          value={effectiveNewSessionPermissionChoiceId}
                        />
                      </SessionSettings>
                      {attachmentName && (
                        <Badge className="max-w-40" tooltip={attachmentName}>
                          {attachmentName}
                        </Badge>
                      )}
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <Button
                          aria-label="Start session"
                          className={cn(
                            "rounded-full",
                            !secureComposerActive &&
                              "border-accent-bright bg-accent-bright text-canvas hover:bg-accent",
                            secureComposerActive &&
                              "border-emerald-400/60 bg-emerald-400 text-emerald-950 shadow-[0_0_18px_rgba(52,211,153,0.16)] hover:bg-emerald-300",
                          )}
                          disabled={
                            !activeAgent?.agent_id ||
                            (Boolean(selectedProjectId) &&
                              !normalizedNewSessionCwd) ||
                            workspaceLoading ||
                            newSessionCwdInvalid ||
                            composerAttachmentUploadPending
                          }
                          icon={<ArrowUp className="h-5 w-5" />}
                          size="icon"
                          tooltip="Start session"
                          type="submit"
                          variant="primary"
                        />
                      </div>
                    </div>
                  </ComposerDropZone>
                </form>
              </>
            )}
          </section>
        </main>
      </div>
    </ConsoleLayout>
  );
}

function ProjectSessionRail({
  activeSessionId,
  archivePendingId,
  hasMore,
  loading,
  loadingMore,
  onLoadMore,
  onProjectFilterChange,
  onScroll,
  onSelectSession,
  onSetArchived,
  projects,
  projectFilter,
  sessions,
}: {
  activeSessionId?: string;
  archivePendingId?: string;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onProjectFilterChange: (projectId: string) => void;
  onScroll: (event: UIEvent<HTMLElement>) => void;
  onSelectSession: (session: WorkItem) => void;
  onSetArchived: (session: WorkItem) => void;
  projects: Project[];
  projectFilter: string;
  sessions: WorkItem[];
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const groups = ["Today", "Yesterday", "Previous 7 days", "Earlier"];
  const groupFor = (session: WorkItem) => {
    const age = today.getTime() - new Date(session.createdAt ?? "").getTime();
    return age <= 0 ? 0 : age <= 86400000 ? 1 : age <= 6 * 86400000 ? 2 : 3;
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 flex items-center gap-2 border-b border-hairline bg-surface-1 px-6 py-2">
        <Folder className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
        <select
          aria-label="Filter by project"
          className="min-w-0 flex-1 bg-surface-1 text-sm text-ink outline-none [color-scheme:dark]"
          value={projectFilter}
          onChange={(event) => onProjectFilterChange(event.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.project_id} value={project.project_id}>
              {projectPath(project, projects)
                .map((item) => item.display_name)
                .join(" / ")}
            </option>
          ))}
        </select>
        <Link href="/settings/projects" className="text-xs text-ink-tertiary">
          Manage
        </Link>
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto pb-4"
        onScroll={onScroll}
        aria-label="Recent sessions"
      >
        {groups.map((label, index) => {
          const items = sessions
            .filter((session) => groupFor(session) === index)
            .sort((a, b) =>
              (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
            );
          return (
            items.length > 0 && (
              <section key={label} aria-label={label}>
                <div className="px-6 pb-1 pt-4 text-xs text-ink-tertiary">
                  {label}
                </div>
                {items.map((session) => (
                  <HomeSessionRow
                    key={session.id}
                    active={session.sessionId === activeSessionId}
                    archivePending={archivePendingId === session.id}
                    depth={0}
                    onSelect={() => onSelectSession(session)}
                    onSetArchived={() => onSetArchived(session)}
                    session={{
                      ...session,
                      context: [
                        projects.find(
                          (project) =>
                            project.project_id === session.primaryProjectId,
                        )?.display_name,
                        session.context,
                      ]
                        .filter(Boolean)
                        .join(" / "),
                    }}
                  />
                ))}
              </section>
            )
          );
        })}
        {loading && (
          <div className="p-4 text-sm text-ink-tertiary">Loading...</div>
        )}
        {loadingMore && (
          <div role="status" className="p-4 text-sm text-ink-tertiary">
            Loading more sessions...
          </div>
        )}
        {!loading && !loadingMore && hasMore && (
          <div className="px-6 py-3">
            <Button
              onClick={onLoadMore}
              size="sm"
              type="button"
              variant="ghost"
            >
              Load more sessions
            </Button>
          </div>
        )}
        {!loading && !sessions.length && (
          <div className="px-6 py-4 text-sm text-ink-tertiary">
            {projectFilter
              ? "No sessions match this project and filters."
              : "No sessions match the current filters."}
          </div>
        )}
      </div>
    </div>
  );
}

function HomeSessionRow({
  active,
  archivePending,
  depth,
  onSelect,
  onSetArchived,
  session,
}: {
  active: boolean;
  archivePending: boolean;
  depth: number;
  onSelect: () => void;
  onSetArchived: () => void;
  session: WorkItem;
}) {
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center pr-3 transition-colors duration-200",
        session.transport === "e2ee"
          ? active
            ? "bg-emerald-400/[0.07] shadow-[inset_2px_0_0_rgba(52,211,153,0.9)]"
            : "text-ink-muted hover:bg-emerald-400/[0.04]"
          : active
            ? "bg-accent/10 shadow-[inset_2px_0_0_var(--color-accent)]"
            : "text-ink-muted hover:bg-surface-2",
      )}
      style={{ paddingLeft: `${24 + depth * 16}px` }}
    >
      <Link
        className="grid min-w-0 flex-1 gap-0.5 py-2 text-left"
        href={session.href}
        onClick={(event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          onSelect();
        }}
      >
        <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink">
          <span className="truncate">{session.title}</span>
          {session.transport === "e2ee" && (
            <Tooltip content="End-to-end encrypted">
              <span
                aria-label="End-to-end encrypted"
                className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10 text-emerald-400 shadow-[0_0_0_rgba(52,211,153,0)] transition-all duration-200 group-hover:border-emerald-300/40 group-hover:bg-emerald-400/15 group-hover:shadow-[0_0_12px_rgba(52,211,153,0.16)]"
                role="img"
              >
                <LockKeyhole className="h-2.5 w-2.5" />
              </span>
            </Tooltip>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-ink-tertiary">
          <span className="truncate">{session.context}</span>
          <span aria-hidden="true" className="shrink-0 text-ink-tertiary/50">
            ·
          </span>
          <span className="shrink-0">{relativeTime(session.createdAt)}</span>
          {session.archivedAt && (
            <span className="shrink-0 text-warning">· Archived</span>
          )}
        </span>
      </Link>
      <Button
        aria-label={`${session.archivedAt ? "Restore" : "Archive"} ${session.title}`}
        className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        disabled={archivePending}
        icon={
          archivePending ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : session.archivedAt ? (
            <ArchiveRestore className="h-3.5 w-3.5" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )
        }
        onClick={onSetArchived}
        size="icon"
        tooltip={session.archivedAt ? "Restore session" : "Archive session"}
        type="button"
        variant="ghost"
      />
    </div>
  );
}

function SessionFilterMenu({
  agentOptions,
  includeArchived,
  nodeOptions,
  onAgentToggle,
  onClearAgents,
  onClearNodes,
  onIncludeArchivedChange,
  onNodeToggle,
  onOpenChange,
  open,
  selectedAgents,
  selectedNodes,
}: {
  agentOptions: Array<{ label: string; value: string }>;
  includeArchived: boolean;
  nodeOptions: Array<{ label: string; value: string }>;
  onAgentToggle: (value: string) => void;
  onClearAgents: () => void;
  onClearNodes: () => void;
  onIncludeArchivedChange: (value: boolean) => void;
  onNodeToggle: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selectedAgents: string[];
  selectedNodes: string[];
}) {
  return (
    <div className="relative">
      <Button
        aria-expanded={open}
        aria-label="Filter sessions"
        icon={<ListFilter className="h-4 w-4" />}
        onClick={() => onOpenChange(!open)}
        size="icon"
        tooltip="Filter sessions"
        type="button"
        variant="ghost"
      />
      {open && (
        <div className="absolute right-0 top-10 z-20 grid w-72 max-w-[calc(100vw-2rem)] gap-3 overflow-hidden rounded-lg border border-hairline bg-surface-1 p-3 shadow-xl shadow-black/30">
          <SessionFilterOptionGroup
            label="Agent"
            onClear={onClearAgents}
            onToggle={onAgentToggle}
            options={agentOptions}
            selectedValues={selectedAgents}
          />
          <SessionFilterOptionGroup
            label="Node"
            onClear={onClearNodes}
            onToggle={onNodeToggle}
            options={nodeOptions}
            selectedValues={selectedNodes}
          />
          <div className="border-t border-hairline pt-2">
            <button
              aria-pressed={includeArchived}
              className={cn(
                "flex min-h-8 w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition",
                includeArchived
                  ? "bg-accent/10 text-ink hover:bg-accent/15"
                  : "text-ink-muted hover:bg-surface-3",
              )}
              onClick={() => onIncludeArchivedChange(!includeArchived)}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">Include archived</span>
              {includeArchived && (
                <Check className="h-4 w-4 shrink-0 text-accent-bright" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionFilterOptionGroup({
  label,
  onClear,
  onToggle,
  options,
  selectedValues,
}: {
  label: "Agent" | "Node";
  onClear: () => void;
  onToggle: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  selectedValues: string[];
}) {
  return (
    <div
      aria-label={`Filter by ${label.toLowerCase()}`}
      className="min-w-0"
      role="group"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-xs text-ink-tertiary">{label}</div>
        {selectedValues.length > 0 && (
          <button
            className="shrink-0 text-xs text-accent hover:underline"
            onClick={onClear}
            type="button"
          >
            Clear
          </button>
        )}
      </div>
      <div className="max-h-36 min-w-0 overflow-y-auto rounded-md border border-hairline bg-surface-2 p-1">
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-ink-tertiary">
            No {label.toLowerCase()}s available
          </div>
        ) : (
          options.map((option) => {
            const selected = selectedValues.includes(option.value);
            return (
              <button
                aria-label={`${label} ${option.label}`}
                aria-pressed={selected}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition",
                  selected
                    ? "bg-accent/10 text-ink hover:bg-accent/15"
                    : "text-ink-muted hover:bg-surface-3",
                )}
                key={option.value}
                onClick={() => onToggle(option.value)}
                title={option.label}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected && (
                  <Check className="h-4 w-4 shrink-0 text-accent-bright" />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function ComposerModeHint({
  mode,
  onClear,
  secure = false,
}: {
  mode: ComposerMode;
  onClear: () => void;
  secure?: boolean;
}) {
  if (mode === "clean") {
    if (secure) {
      return null;
    }

    return null;
  }

  return (
    <div className="mb-2 flex min-w-0 items-center gap-2 rounded-2xl border border-hairline bg-canvas px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
          {mode === "summarize-note"
            ? "Summarize with note"
            : "Comment on draft"}
        </div>
        <div className="text-sm text-ink-muted">
          {mode === "summarize-note"
            ? "Add notes to guide the generated draft."
            : "Tell the agent what to change in the draft."}
        </div>
      </div>
      <Button
        icon={<X className="h-4 w-4" />}
        onClick={onClear}
        size="icon"
        tooltip="Remove context from composer"
        type="button"
        variant="ghost"
      />
    </div>
  );
}

function SelectedContext({
  generatedDraft,
  item,
  onArchive,
  onCommentOnDraft,
  onClose,
  onGenerateDraft,
  onSummarizeWithNote,
  user,
}: {
  generatedDraft?: string;
  item?: WorkItem;
  onArchive: () => void;
  onCommentOnDraft: () => void;
  onClose: () => void;
  onGenerateDraft: () => void;
  onSummarizeWithNote: () => void;
  user: User;
}) {
  const queryClient = useQueryClient();
  const approvalDecision = useMutation({
    mutationFn: ({
      approvalId,
      optionId,
    }: {
      approvalId: string;
      optionId: string;
    }) => decideApproval(user.user_id, approvalId, optionId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.approvals(user.user_id),
      }),
  });

  if (!item) {
    return (
      <section className="flex min-h-24 items-center justify-center px-4 py-5 text-center sm:min-h-[160px] sm:py-10">
        <div className="grid gap-1.5">
          <div className="text-lg font-medium tracking-tight text-ink">
            What’s next?
          </div>
          <div className="text-xs text-ink-tertiary">
            <span className="sm:hidden">Type below to start a session</span>
            <span className="hidden sm:inline">
              Type below to start a session · Enter to send, Shift+Enter for a
              new line
            </span>
          </div>
        </div>
      </section>
    );
  }

  if (item.kind === "inquiry") {
    const draft = generatedDraft ?? item.draft;
    const needsSummary = item.inquiryState === "needs-summary";
    const statusLabel = draft
      ? "draft ready"
      : needsSummary
        ? "ready to summarize"
        : "ready to draft";
    const emptyDraftLabel = needsSummary
      ? "conversation ready"
      : "empty session";
    const emptyDraftText = needsSummary
      ? "No draft yet. Summarize the conversation into a response draft, or add a note first."
      : "No draft yet. This inquiry has no conversation yet, so generate a draft from the background and question.";

    return (
      <section className="grid gap-5 py-2">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-ink-tertiary">
              {kindIcon[item.kind]}
              Inquiry
            </div>
            <TruncatedText
              className="mt-2 text-xl font-medium"
              tooltip={item.title}
            >
              {item.title}
            </TruncatedText>
            <TruncatedText className="mt-2 text-sm text-ink-tertiary">
              {item.context}
              {item.ownerAlias ? ` · owner ${item.ownerAlias}` : ""}
            </TruncatedText>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Badge tone={draft ? "success" : "warning"}>{statusLabel}</Badge>
            <Button
              icon={<Archive className="h-4 w-4" />}
              onClick={onArchive}
              size="icon"
              tooltip="Archive inquiry"
              type="button"
              variant="ghost"
            />
            <Button
              icon={<X className="h-4 w-4" />}
              onClick={onClose}
              size="icon"
              tooltip="Detach inquiry from composer"
              type="button"
              variant="ghost"
            />
          </div>
        </div>

        <div className="grid gap-4 border-t border-hairline pt-4">
          <div>
            <div className="text-xs text-ink-tertiary">Background</div>
            <div className="mt-1 text-sm leading-6 text-ink-muted">
              {item.background ?? item.detail}
            </div>
          </div>
          <div>
            <div className="text-xs text-ink-tertiary">Question</div>
            <div className="mt-1 text-sm leading-6 text-ink">
              {item.question ?? item.title}
            </div>
          </div>
        </div>

        {item.conversationTurns && item.conversationTurns.length > 0 && (
          <div className="grid gap-3 border-t border-hairline pt-4">
            <div className="text-xs text-ink-tertiary">Conversation</div>
            <div className="grid gap-3">
              {item.conversationTurns.map((turn, index) => (
                <div className="grid gap-1" key={`${turn.speaker}-${index}`}>
                  <div className="text-xs font-medium text-ink-muted">
                    {turn.speaker}
                  </div>
                  <div className="text-sm leading-6 text-ink-muted">
                    {turn.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-2 border-t border-hairline pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-ink-tertiary">Draft response</div>
            <Badge>{draft ? "ready" : emptyDraftLabel}</Badge>
          </div>
          <div className="text-sm leading-6 text-ink-muted">
            {draft ?? emptyDraftText}
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          {draft ? (
            <>
              <Button size="sm" type="button" variant="primary">
                Send
              </Button>
              <Button
                onClick={onCommentOnDraft}
                size="sm"
                type="button"
                variant="secondary"
              >
                Comment
              </Button>
            </>
          ) : (
            <NoDraftInquiryActions
              needsSummary={needsSummary}
              onGenerateDraft={onGenerateDraft}
              onSummarizeWithNote={onSummarizeWithNote}
            />
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-5 py-2">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            {kindIcon[item.kind]}
            Selected context
          </div>
          <TruncatedText
            className="mt-2 text-xl font-medium"
            tooltip={item.title}
          >
            {item.title}
          </TruncatedText>
          <TruncatedText className="mt-2 text-sm leading-6 text-ink-muted">
            {item.detail}
          </TruncatedText>
        </div>
        <Badge tone={item.priority === "high" ? "warning" : "neutral"}>
          {item.priority}
        </Badge>
      </div>
      <div className="grid gap-2 border-t border-hairline pt-4">
        <ContextLine label="Source" value={item.source} />
        <ContextLine label="Context" value={item.context} />
        <ContextLine label="Suggested action" value={item.actionLabel} />
        {item.nodeId && (
          <ContextLine label="Node" value={compactId(item.nodeId)} />
        )}
        {item.agentId && (
          <ContextLine label="Agent" value={compactId(item.agentId)} />
        )}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        {item.kind === "approval" &&
          item.approval &&
          homeApprovalOptions(item.approval).map((option) => (
            <Button
              disabled={approvalDecision.isPending}
              key={option.optionId}
              onClick={() =>
                approvalDecision.mutate({
                  approvalId: item.approval!.approval_id,
                  optionId: option.optionId,
                })
              }
              size="sm"
              type="button"
              variant={option.optionId === "deny" ? "danger" : "primary"}
            >
              {option.label}
            </Button>
          ))}
        <Link
          className="inline-flex min-h-8 max-w-full shrink-0 items-center gap-2 rounded-lg border border-hairline bg-surface-1 px-2.5 text-xs font-medium text-ink-muted transition hover:border-hairline-strong hover:bg-surface-2 hover:text-ink"
          href={item.href}
        >
          Open
        </Link>
        {item.actionHref && item.kind !== "approval" && (
          <Link
            className="inline-flex min-h-8 max-w-full shrink-0 items-center gap-2 rounded-lg border border-primary bg-primary px-2.5 text-xs font-medium text-canvas transition hover:bg-primary-hover"
            href={item.actionHref}
          >
            {item.actionLabel}
          </Link>
        )}
      </div>
    </section>
  );
}

function NoDraftInquiryActions({
  needsSummary,
  onGenerateDraft,
  onSummarizeWithNote,
}: {
  needsSummary: boolean;
  onGenerateDraft: () => void;
  onSummarizeWithNote: () => void;
}) {
  if (needsSummary) {
    return (
      <>
        <Button
          onClick={onGenerateDraft}
          size="sm"
          type="button"
          variant="primary"
        >
          Summarize draft
        </Button>
        <Button
          onClick={onSummarizeWithNote}
          size="sm"
          type="button"
          variant="secondary"
        >
          Summarize with note
        </Button>
      </>
    );
  }

  return (
    <Button onClick={onGenerateDraft} size="sm" type="button" variant="primary">
      Generate draft
    </Button>
  );
}

function AgentSelector({
  agents,
  nodes,
  onChange,
  selectedAgentId,
}: {
  agents: Agent[];
  nodes: Node[];
  onChange: (agentId: string) => void;
  selectedAgentId?: string;
}) {
  const selectedAgent = agents.find(
    (agent) => agent.agent_id === selectedAgentId,
  );
  const agentDisplayLabels = useMemo(
    () => buildAgentDisplayLabels(agents, nodes),
    [agents, nodes],
  );
  const selectedLabel = selectedAgent
    ? (agentDisplayLabels.get(selectedAgent.agent_id) ??
      agentLabel(selectedAgent))
    : agents.length === 0
      ? "No agent"
      : "Select agent";
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="min-w-0 flex-1">
        <PopoverTrigger asChild>
          <button
            className="inline-flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-transparent bg-transparent py-1 pl-2 pr-2 text-sm text-ink-muted outline-none transition hover:bg-surface-3 focus:border-hairline-strong"
            aria-expanded={open}
            disabled={agents.length === 0}
            type="button"
          >
            <span className="relative grid h-4 w-4 shrink-0 place-items-center">
              <Bot className="h-4 w-4 text-ink-tertiary" />
              {selectedAgent?.online && (
                <OnlineDot className="-right-0.5 -top-1" />
              )}
            </span>
            <TruncatedText className="min-w-0 flex-1 text-left">
              {selectedLabel}
            </TruncatedText>
            <ChevronDown className="h-4 w-4 shrink-0 text-ink-tertiary" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        aria-label="Choose agent"
        align="end"
        side="bottom"
        collisionPadding={12}
        className="w-72 max-h-[min(16rem,var(--radix-popover-content-available-height))] p-1"
      >
        {agents.map((agent) => (
          <button
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink transition",
              agent.agent_id === selectedAgentId
                ? "bg-accent/10 hover:bg-accent/15"
                : "hover:bg-surface-3",
            )}
            key={agent.agent_id}
            onClick={() => {
              onChange(agent.agent_id);
              setOpen(false);
            }}
            type="button"
          >
            <span className="grid h-4 w-4 shrink-0 place-items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "h-2 w-2 rounded-full",
                  agent.online ? "bg-success" : "bg-ink-tertiary/30",
                )}
              />
            </span>
            <TruncatedText className="min-w-0 flex-1">
              {agentDisplayLabels.get(agent.agent_id) ?? agentLabel(agent)}
            </TruncatedText>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function OnlineDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute h-2 w-2 rounded-full bg-success ring-2 ring-canvas",
        className,
      )}
    />
  );
}

function ContextLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 grid-cols-[110px_minmax(0,1fr)] gap-3 text-xs">
      <div className="text-ink-tertiary">{label}</div>
      <TruncatedText className="text-ink-muted" tooltip={value}>
        {value}
      </TruncatedText>
    </div>
  );
}

function ApiState({ error }: { error: Error }) {
  return (
    <div className="mx-5 mt-4 flex items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-3 text-sm text-ink-muted">
      <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
      <div>
        <div className="font-medium text-ink">API request failed</div>
        <div className="mt-1 font-mono text-xs text-ink-tertiary">
          {error.name}: {error.message}
        </div>
      </div>
    </div>
  );
}

function buildWorkItems({
  agents,
  approvals,
  envelopes,
  invites,
  nodes,
  showMockInquiries,
  sessions,
}: {
  agents: Agent[];
  approvals: AgentApproval[];
  envelopes: Envelope[];
  invites: TeamInvite[];
  nodes: Node[];
  showMockInquiries: boolean;
  sessions: AgentSession[];
}) {
  const agentsById = new Map(agents.map((agent) => [agent.agent_id, agent]));
  const nodesById = new Map(nodes.map((node) => [node.node_id, node]));
  const pendingApprovals = approvals.filter(
    (approval) => (approval.status ?? "pending") === "pending",
  );
  const pendingInvites = invites.filter(
    (invite) => invite.status === "pending",
  );

  return byRecent(
    [
      ...(showMockInquiries ? fakeInquiryWorkItems(agents, nodes) : []),
      ...pendingApprovals.map((approval): WorkItem => {
        const agent = approval.request_agent_id
          ? agentsById.get(approval.request_agent_id)
          : undefined;
        const node = approval.request_node_id
          ? nodesById.get(approval.request_node_id)
          : undefined;

        return {
          actionLabel: "Decide now",
          agentId: approval.request_agent_id,
          approval,
          context: [
            agent?.name ?? approval.request_agent_id,
            node?.name ?? node?.hostname ?? approval.request_node_id,
          ]
            .filter(Boolean)
            .join(" · "),
          createdAt: approval.created_at,
          detail:
            approval.description ??
            approval.operation ??
            "A tool call is waiting for human approval.",
          href: approval.request_session_id
            ? `/?session_id=${encodeURIComponent(approval.request_session_id)}`
            : "/",
          id: `approval:${approval.approval_id}`,
          kind: "approval",
          nodeId: approval.request_node_id,
          priority: "high",
          source: approval.domain ?? "Approval request",
          title: approval.title ?? approval.operation ?? "Approval required",
        };
      }),
      ...envelopes.map(
        (envelope): WorkItem => ({
          actionHref: "/collaboration/envelopes",
          actionLabel: "Review",
          context: envelope.message ?? envelope.payload_type,
          createdAt: envelope.created_at,
          detail:
            envelope.message ??
            "A received envelope can be reviewed from the envelope mailbox.",
          href: "/collaboration/envelopes",
          id: `envelope:${envelope.envelope_id}`,
          kind: "envelope",
          priority: "medium",
          source: envelope.sender_email,
          title:
            envelope.payload_type === "knowledge_capsule"
              ? "Knowledge envelope received"
              : "Envelope received",
        }),
      ),
      ...pendingInvites.map(
        (invite): WorkItem => ({
          actionHref: "/collaboration/teams",
          actionLabel: "Review",
          context: `Role: ${invite.role}`,
          createdAt: invite.created_at,
          detail: `You were invited to join team ${invite.team_id}.`,
          href: "/collaboration/teams",
          id: `invite:${invite.invite_id}`,
          kind: "invite",
          priority: "medium",
          source: invite.email,
          title: "Team invite",
        }),
      ),
      ...sessions.map((session): WorkItem => {
        const agent = agentsById.get(session.agent_id);
        const node = nodesById.get(session.node_id);
        const sessionHref = homeSessionHref(session);

        return {
          actionHref: sessionHref,
          actionLabel: "Continue",
          agentId: session.agent_id,
          archivedAt: session.archived_at,
          context: [
            agent?.name ?? agent?.agent_type ?? session.agent_id,
            node?.name ?? node?.hostname ?? session.node_id,
          ].join(" · "),
          createdAt: sessionTimestamp(session),
          detail:
            session.preview ??
            session.current_task ??
            "Continue this agent work session.",
          href: sessionHref,
          id: `session:${session.session_id}`,
          kind: "session",
          nodeId: session.node_id,
          primaryProjectId: session.primary_project_id,
          priority:
            session.runtime_status === "waiting_approval" ? "high" : "low",
          runStatus: session.runtime_status,
          sessionId: session.session_id,
          source: "Recent session",
          title: sessionTitle(session),
          transport: session.transport,
        };
      }),
    ],
    (item) => item.createdAt,
  );
}

function homeApprovalOptions(approval: AgentApproval) {
  const options = (approval.options ?? [])
    .filter(
      (option) =>
        option.option_id === "deny" || option.option_id === "allow_once",
    )
    .map((option) => ({
      label: option.label ?? approvalOptionLabel(option.option_id!),
      optionId: option.option_id!,
    }));

  return options.length
    ? options
    : [
        { label: "Allow once", optionId: "allow_once" },
        { label: "Deny", optionId: "deny" },
      ];
}

function approvalOptionLabel(optionId: string) {
  return optionId
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function homeSessionHref(session: AgentSession) {
  return `/?session_id=${encodeURIComponent(session.session_id)}`;
}

function fakeInquiryWorkItems(agents: Agent[], nodes: Node[]): WorkItem[] {
  const primaryAgent = agents[0];
  const primaryNode =
    nodes.find((node) => node.node_id === primaryAgent?.node_id) ?? nodes[0];
  const metadata = [
    primaryAgent?.name ?? primaryAgent?.agent_type ?? "Codex",
    primaryNode?.name ?? primaryNode?.hostname ?? "desk mac",
  ].join(" · ");

  return [
    {
      actionLabel: "Generate draft",
      agentId: primaryAgent?.agent_id,
      background:
        "The agent has enough context to answer a straightforward product question. The session is empty, so generating a draft should be cheap and safe.",
      context: metadata,
      createdAt: "2026-07-02T06:45:00Z",
      detail:
        "The user wants a concise explanation of the clean-session behavior before shipping the Home composer changes.",
      href: "/",
      id: "inquiry:home-composer-plan",
      inquiryState: "needs-draft",
      kind: "inquiry",
      nodeId: primaryAgent?.node_id ?? primaryNode?.node_id,
      ownerAlias: "kai",
      priority: "high",
      question:
        "Can you summarize why clean sessions should stay separate from inquiry context?",
      source: "Kai · product inquiry",
      title: "Explain clean session behavior",
    },
    {
      actionLabel: "Send",
      agentId: primaryAgent?.agent_id,
      background:
        "The agent already produced a short reply draft from a simple inquiry. The human only needs to review or comment on the draft.",
      context: "Design review · clean session behavior",
      createdAt: "2026-07-02T06:18:00Z",
      detail:
        "Review the generated response and either send it or leave a comment for the agent.",
      draft:
        "Clean sessions should be the default so users can start fresh without accidentally carrying inbox context. Inquiry context should stay explicit and visible in the inquiry box.",
      href: "/",
      id: "inquiry:clean-session-design",
      inquiryState: "draft-ready",
      kind: "inquiry",
      nodeId: primaryAgent?.node_id ?? primaryNode?.node_id,
      ownerAlias: "sam",
      priority: "medium",
      question:
        "Should inquiry context attach automatically when a row is selected?",
      source: "PAX Console · inquiry draft",
      title: "Clarify clean session versus inquiry context",
    },
    {
      actionLabel: "Summarize draft",
      agentId: primaryAgent?.agent_id,
      background:
        "The agent already discussed the request with the human. The remaining work is to turn the conversation into a concise response draft.",
      conversationTurns: [
        {
          body: "Can we approve a read-only investigation here, or should we ask them to narrow the scope first?",
          speaker: "Morgan",
        },
        {
          body: "Read-only is fine, but require a short plan before running anything expensive or touching private workspace data.",
          speaker: primaryAgent?.name ?? primaryAgent?.agent_type ?? "Codex",
        },
      ],
      context: metadata,
      createdAt: "2026-07-02T05:52:00Z",
      detail:
        "Summarize the prior conversation into a response the requester can use.",
      href: "/",
      id: "inquiry:needs-human-note",
      inquiryState: "needs-summary",
      kind: "inquiry",
      nodeId: primaryAgent?.node_id ?? primaryNode?.node_id,
      ownerAlias: "morgan",
      priority: "medium",
      question:
        "Can we tell the requester to proceed, but only in read-only mode and with a plan first?",
      source: "Morgan · engineering inquiry",
      title: "Approve read-only investigation wording",
    },
  ];
}

function draftFromInquiry(inquiry: WorkItem, note: string) {
  const noteSuffix = note.trim() ? ` Notes included: ${note.trim()}` : "";
  if (inquiry.inquiryState === "needs-summary") {
    return `Summarized draft: approve a read-only investigation, ask for a short plan first, and avoid expensive runs or private workspace data unless explicitly approved.${noteSuffix}`;
  }

  return `Draft reply: ${inquiry.question ?? inquiry.title} Keep the reply concise and explicit about the requested next step.${noteSuffix}`;
}

function composerPlaceholder(mode: ComposerMode) {
  if (mode === "summarize-note") {
    return "Add notes to guide the draft...";
  }

  if (mode === "comment-draft") {
    return "Tell the agent what to change in the draft...";
  }

  return "Ask an agent to do something";
}

function replaceHomeSessionUrl(sessionId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams({ session_id: sessionId });
  window.history.replaceState(window.history.state, "", `/?${params}`);
}

function clearHomeSessionUrl() {
  if (typeof window === "undefined") {
    return;
  }

  window.history.replaceState(window.history.state, "", "/");
}

function resolveEmbeddedSessionTarget(
  target: EmbeddedSessionTarget,
  items: WorkItem[],
) {
  if (target.sessionId === "new" || (target.nodeId && target.agentId)) {
    return target;
  }

  const sessionItem = items.find(
    (item) => item.kind === "session" && item.sessionId === target.sessionId,
  );
  if (!sessionItem) {
    return target;
  }

  return {
    ...target,
    agentId: sessionItem.agentId,
    key: `url:${target.sessionId}:${sessionItem.nodeId ?? ""}:${sessionItem.agentId ?? ""}`,
    nodeId: sessionItem.nodeId,
  };
}

function buildSessionAgentFilterOptions(agents: Agent[], nodes: Node[]) {
  const agentDisplayLabels = buildAgentDisplayLabels(agents, nodes);
  const sessionAgentOptions = new Map(
    agents.map((agent) => [
      agent.agent_id,
      agentDisplayLabels.get(agent.agent_id) ?? compactId(agent.agent_id),
    ]),
  );

  return [
    ...[...sessionAgentOptions.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ label, value })),
  ];
}

function buildSessionNodeFilterOptions(nodes: Node[]) {
  const nodeDisplayLabels = buildNodeDisplayLabels(nodes);

  return [
    ...nodes
      .map((node) => ({
        label: nodeDisplayLabels.get(node.node_id) ?? compactId(node.node_id),
        value: node.node_id,
      }))
      .sort((left, right) => left.label.localeCompare(right.label)),
  ];
}

function buildAgentDisplayLabels(agents: Agent[], nodes: Node[]) {
  const nodeDisplayLabels = buildNodeDisplayLabels(nodes);
  const labelCounts = new Map<string, number>();

  for (const agent of agents) {
    const label = agentLabel(agent);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  return new Map(
    agents.map((agent) => {
      const label = agentLabel(agent);
      if ((labelCounts.get(label) ?? 0) < 2) {
        return [agent.agent_id, label] as const;
      }

      const nodeLabel = agent.node_id
        ? (nodeDisplayLabels.get(agent.node_id) ?? compactId(agent.node_id))
        : `No node (${compactId(agent.agent_id)})`;
      return [agent.agent_id, `${label} @ ${nodeLabel}`] as const;
    }),
  );
}

function buildNodeDisplayLabels(nodes: Node[]) {
  const labelCounts = new Map<string, number>();

  for (const node of nodes) {
    const label = nodeLabel(node);
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  return new Map(
    nodes.map((node) => {
      const label = nodeLabel(node);
      return [
        node.node_id,
        (labelCounts.get(label) ?? 0) > 1
          ? `${label} (${compactId(node.node_id)})`
          : label,
      ] as const;
    }),
  );
}

function filterSessionWorkItems(
  items: WorkItem[],
  sessionAgentFilters: string[],
  sessionNodeFilters: string[],
) {
  return byRecent(
    items.filter(
      (item) =>
        item.kind === "session" &&
        (sessionAgentFilters.length === 0 ||
          (item.agentId && sessionAgentFilters.includes(item.agentId))) &&
        (sessionNodeFilters.length === 0 ||
          (item.nodeId && sessionNodeFilters.includes(item.nodeId))),
    ),
    (item) => item.createdAt,
  );
}

function toggleFilterValue(current: string[], value: string) {
  return current.includes(value)
    ? current.filter((candidate) => candidate !== value)
    : [...current, value];
}

function removeArchivedWorkItems(items: WorkItem[], archivedIds: string[]) {
  if (archivedIds.length === 0) {
    return items;
  }

  const archived = new Set(archivedIds);
  return items.filter((item) => !archived.has(item.id));
}

function sortOnlineFirst<T>(
  items: T[],
  isOnline: (item: T) => boolean | undefined,
  label: (item: T) => string,
) {
  return [...items].sort((left, right) => {
    const onlineDelta =
      Number(Boolean(isOnline(right))) - Number(Boolean(isOnline(left)));
    if (onlineDelta !== 0) {
      return onlineDelta;
    }

    return label(left).localeCompare(label(right));
  });
}

function sortAgentsForHome(
  agents: Agent[],
  latestSessionTimeByAgent: Map<string, number>,
) {
  return [...agents].sort((left, right) => {
    const onlineDelta =
      Number(Boolean(right.online)) - Number(Boolean(left.online));
    if (onlineDelta !== 0) {
      return onlineDelta;
    }

    const recentDelta =
      (latestSessionTimeByAgent.get(right.agent_id) ??
        Number.NEGATIVE_INFINITY) -
      (latestSessionTimeByAgent.get(left.agent_id) ?? Number.NEGATIVE_INFINITY);
    if (recentDelta !== 0) {
      return recentDelta;
    }

    return agentLabel(left).localeCompare(agentLabel(right));
  });
}

function dedupeSessionsById(sessions: AgentSession[]) {
  const deduped = new Map<string, AgentSession>();

  for (const session of sessions) {
    const current = deduped.get(session.session_id);
    if (
      !current ||
      timeValue(sessionTimestamp(session)) >
        timeValue(sessionTimestamp(current))
    ) {
      deduped.set(session.session_id, session);
    }
  }

  return [...deduped.values()];
}

function byRecent<T>(items: T[], timestamp: (item: T) => string | undefined) {
  return [...items].sort(
    (left, right) => timeValue(timestamp(right)) - timeValue(timestamp(left)),
  );
}

function latestSessionMessageTimeByAgent(sessions: AgentSession[]) {
  const latestByAgent = new Map<string, number>();

  for (const session of sessions) {
    const messageTime = timeValue(sessionMessageTimestamp(session));
    const currentTime =
      latestByAgent.get(session.agent_id) ?? Number.NEGATIVE_INFINITY;
    if (messageTime > currentTime) {
      latestByAgent.set(session.agent_id, messageTime);
    }
  }

  return latestByAgent;
}

function projectPath(project: Project, projects: Project[]) {
  const byId = new Map(projects.map((item) => [item.project_id, item]));
  const path: Project[] = [];
  const visited = new Set<string>();
  let current: Project | undefined = project;

  while (current && !visited.has(current.project_id)) {
    path.unshift(current);
    visited.add(current.project_id);
    current = current.parent_project_id
      ? byId.get(current.parent_project_id)
      : undefined;
  }
  return path;
}

function agentLabel(agent: Agent) {
  return agent.name ?? agent.agent_type ?? agent.agent_id;
}

function nodeLabel(node: Node) {
  return node.name ?? node.hostname ?? node.node_id;
}

function sessionTitle(session: AgentSession) {
  const name = session.name?.trim();
  if (name) {
    const combinedName = name.match(/^(.*?)\s+\((.*)\)$/);
    if (combinedName && combinedName[1].trim() === combinedName[2].trim()) {
      return combinedName[1].trim();
    }
    return name;
  }

  return session.current_task?.trim() || session.session_id;
}

function sessionTimestamp(session: AgentSession) {
  return (
    session.last_user_message_at ??
    session.last_message_at ??
    session.updated_at ??
    session.last_active_at
  );
}

function sessionMessageTimestamp(session: AgentSession) {
  return (
    session.last_user_message_at ??
    session.last_message_at ??
    session.updated_at ??
    session.last_active_at
  );
}

function timeValue(value?: string) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function relativeTime(value?: string) {
  if (!value) {
    return "unknown";
  }

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }

  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) {
    return "now";
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
}
