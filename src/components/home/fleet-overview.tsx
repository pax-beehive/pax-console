"use client";

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
  AlertCircle,
  ArrowUp,
  Bot,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  Inbox,
  ListFilter,
  LoaderCircle,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Radio,
  ShieldCheck,
  Server,
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
  completeUserAttachment,
  createUserAttachment,
  listAgents,
  listUserSessions,
  decideApproval,
  uploadUserAttachmentFile,
  useApprovals,
  useEnvelopes,
  useNodes,
  useTeamInvites,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import {
  Agent,
  AgentApproval,
  AgentSession,
  Envelope,
  Node,
  SessionApprovalMode,
  TeamInvite,
  User,
} from "@/features/api/types";
import { compactId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { isSupportedSessionWorkspace } from "@/features/runtime/workspace-path";
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
type HomeRailTab = "sessions" | "inbox";
type InboxFilter = "all" | "inquiries" | "needs-action";
type InboxOrder = "recent" | "priority";
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
  ownerAlias?: string;
  priority: "high" | "medium" | "low";
  question?: string;
  conversationTurns?: InquiryTurn[];
  sessionId?: string;
  source: string;
  title: string;
};

type EmbeddedSessionTarget = {
  agentId?: string;
  initialApprovalMode?: SessionApprovalMode;
  initialAttachments?: ComposerAttachment[];
  initialCwd?: string;
  initialPrompt?: string;
  key: string;
  nodeId?: string;
  sessionId: string;
};

const inboxFilters: Array<{ label: string; value: InboxFilter }> = [
  { label: "All", value: "all" },
  { label: "Inquiries", value: "inquiries" },
  { label: "Needs action", value: "needs-action" },
];

const inboxOrders: Array<{ label: string; value: InboxOrder }> = [
  { label: "Recent", value: "recent" },
  { label: "Priority", value: "priority" },
];

const allSessionAgentsValue = "__all_session_agents__";
const allSessionNodesValue = "__all_session_nodes__";
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
  const urlSessionId = searchParams.get("sessionId") ?? "";
  const [composerMode, setComposerMode] = useState<ComposerMode>("clean");
  const [draft, setDraft] = useState("");
  const [generatedDrafts, setGeneratedDrafts] = useState<
    Record<string, string>
  >({});
  const [newSessionCwd, setNewSessionCwd] = useState("");
  const [newSessionWorkspaceOpen, setNewSessionWorkspaceOpen] = useState(false);
  const [newSessionApprovalMode, setNewSessionApprovalMode] =
    useState<SessionApprovalMode>("manual");
  const [attachmentName, setAttachmentName] = useState("");
  const [composerAttachments, setComposerAttachments] = useState<
    ComposerAttachment[]
  >([]);
  const [composerAttachmentError, setComposerAttachmentError] =
    useState<Error | null>(null);
  const [composerAttachmentUploadPending, setComposerAttachmentUploadPending] =
    useState(false);
  const [archivedWorkItemIds, setArchivedWorkItemIds] = useState<string[]>([]);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [homeRailTab, setHomeRailTab] = useState<HomeRailTab>("sessions");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [inboxOrder, setInboxOrder] = useState<InboxOrder>("recent");
  const [mobileComposerOpen, setMobileComposerOpen] = useState(true);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [contextClosed, setContextClosed] = useState(false);
  const [orderMenuOpen, setOrderMenuOpen] = useState(false);
  const [sessionAgentFilter, setSessionAgentFilter] = useState(
    allSessionAgentsValue,
  );
  const [sessionAgentMenuOpen, setSessionAgentMenuOpen] = useState(false);
  const [sessionNodeFilter, setSessionNodeFilter] =
    useState(allSessionNodesValue);
  const [sessionNodeMenuOpen, setSessionNodeMenuOpen] = useState(false);
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
  const effectiveSessionAgentFilter = sessionAgentFilterOptions.some(
    (option) => option.value === sessionAgentFilter,
  )
    ? sessionAgentFilter
    : allSessionAgentsValue;
  const sessionFilterAgentIds = useMemo(
    () =>
      effectiveSessionAgentFilter === allSessionAgentsValue
        ? []
        : [effectiveSessionAgentFilter],
    [effectiveSessionAgentFilter],
  );
  const effectiveSessionNodeFilter = sessionNodeFilterOptions.some(
    (option) => option.value === sessionNodeFilter,
  )
    ? sessionNodeFilter
    : allSessionNodesValue;
  const sessionFilterNodeIds = useMemo(
    () =>
      effectiveSessionNodeFilter === allSessionNodesValue
        ? []
        : [effectiveSessionNodeFilter],
    [effectiveSessionNodeFilter],
  );
  const sessionsQuery = useInfiniteQuery({
    queryKey: queryKeys.userSessions(user.user_id, {
      agentIds: sessionFilterAgentIds,
      nodeIds: sessionFilterNodeIds,
      pageSize: homeSessionPageSize,
    }),
    queryFn: ({ pageParam }) =>
      listUserSessions(user.user_id, {
        agentIds: sessionFilterAgentIds,
        nodeIds: sessionFilterNodeIds,
        pageNum: pageParam,
        pageSize: homeSessionPageSize,
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
  const activeAgent =
    agents.find((agent) => agent.agent_id === selectedAgentId) ?? agents[0];
  const normalizedNewSessionCwd = newSessionCwd.trim();
  const newSessionCwdInvalid =
    normalizedNewSessionCwd.length > 0 &&
    !isSupportedSessionWorkspace(normalizedNewSessionCwd);

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
      filterAndOrderWorkItems(
        activeWorkItems,
        homeRailTab,
        inboxFilter,
        inboxOrder,
        effectiveSessionAgentFilter,
        effectiveSessionNodeFilter,
      ),
    [
      activeWorkItems,
      effectiveSessionAgentFilter,
      effectiveSessionNodeFilter,
      homeRailTab,
      inboxFilter,
      inboxOrder,
    ],
  );
  const sessionAgentFilterLabel =
    sessionAgentFilterOptions.find(
      (option) => option.value === effectiveSessionAgentFilter,
    )?.label ?? "All agents";
  const sessionNodeFilterLabel =
    sessionNodeFilterOptions.find(
      (option) => option.value === effectiveSessionNodeFilter,
    )?.label ?? "All nodes";
  const selectedWorkItem = selectedWorkItemId
    ? visibleWorkItems.find((item) => item.id === selectedWorkItemId)
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
  const needsActionCount = activeWorkItems.filter(
    (item) => item.kind !== "session",
  ).length;
  const railTitle = homeRailTab === "sessions" ? "Sessions" : "Inbox queue";
  const railSubtitle =
    homeRailTab === "sessions"
      ? `Recent sessions · ${sessionAgentFilterLabel} · ${sessionNodeFilterLabel}`
      : `${filterLabel(inboxFilter)} · ${orderLabel(inboxOrder)}`;
  const apiError =
    nodesQuery.error ??
    agentsQuery.error ??
    sessionsQuery.error ??
    approvalsQuery.error ??
    envelopesQuery.error ??
    invitesQuery.error ??
    null;
  const fleetSetupGuideKind =
    nodes.length === 0 ? "node" : agents.length === 0 ? "agent" : null;
  const mobileDetailOpen = Boolean(activeSessionTarget || composerContextItem);
  const mobilePaneOpen = mobileDetailOpen || mobileComposerOpen;
  const mobileDetailTitle = activeSessionTarget
    ? "Session"
    : mobileComposerOpen
      ? "New chat"
      : homeRailTab === "inbox"
        ? "Inbox"
        : "Composer";

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

  function handleRailScroll(event: UIEvent<HTMLElement>) {
    if (
      homeRailTab !== "sessions" ||
      !sessionsQuery.hasNextPage ||
      sessionsQuery.isFetchingNextPage ||
      sessionsQuery.isLoading
    ) {
      return;
    }

    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    if (
      scrollHeight - scrollTop - clientHeight <=
      nextSessionPageScrollOffset
    ) {
      void sessionsQuery.fetchNextPage();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      newSessionCwdInvalid ||
      composerAttachmentUploadPending
    ) {
      return;
    }

    const nonce = Date.now();
    const initialPrompt = draft.trim();
    setEmbeddedSessionTarget({
      agentId: activeAgent.agent_id,
      initialApprovalMode: newSessionApprovalMode,
      initialAttachments: composerAttachments,
      initialCwd: normalizedNewSessionCwd || undefined,
      initialPrompt: initialPrompt || undefined,
      key: `new:${nonce}`,
      nodeId: activeAgent.node_id,
      sessionId: "new",
    });
    clearHomeSessionUrl();
    setHomeRailTab("sessions");
    setMobileComposerOpen(false);
    setMobileRailOpen(false);
    setSelectedWorkItemId("");
    setContextClosed(false);
    setComposerMode("clean");
    setDraft("");
    setComposerAttachments([]);
    setComposerAttachmentError(null);
  }

  async function addComposerAttachments(files: File[]) {
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
  }

  function showCleanComposer() {
    const targetAgentId =
      activeSessionTarget?.agentId ??
      (effectiveSessionAgentFilter === allSessionAgentsValue
        ? undefined
        : effectiveSessionAgentFilter);

    if (targetAgentId) {
      setSelectedAgentId(targetAgentId);
    }

    setEmbeddedSessionTarget(null);
    clearHomeSessionUrl();
    setHomeRailTab("sessions");
    setMobileComposerOpen(true);
    setMobileRailOpen(false);
    setSelectedWorkItemId("");
    setContextClosed(false);
    setComposerMode("clean");
    setDraft("");
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
              "min-h-0 overflow-auto border-b border-hairline bg-surface-1 lg:static lg:z-auto lg:block lg:w-auto lg:border-b-0 lg:border-r lg:shadow-none",
              mobilePaneOpen
                ? mobileRailOpen
                  ? "absolute inset-y-0 left-0 z-30 block w-[min(82vw,320px)] shadow-2xl shadow-black/50"
                  : "hidden"
                : "block",
            )}
            onScroll={handleRailScroll}
          >
            <div className="sticky top-0 z-10 border-b border-hairline bg-surface-1 px-4 py-3">
              <div className="mb-3 grid grid-cols-2 gap-1 rounded-md border border-hairline bg-canvas p-1">
                <button
                  className={cn(
                    "inline-flex min-h-8 min-w-0 items-center justify-center gap-2 rounded-sm px-2 text-xs font-medium transition",
                    homeRailTab === "sessions"
                      ? "bg-accent/15 text-accent-bright"
                      : "text-ink-tertiary hover:bg-surface-2 hover:text-ink-muted",
                  )}
                  onClick={() => {
                    setHomeRailTab("sessions");
                    setFilterMenuOpen(false);
                    setOrderMenuOpen(false);
                    setSessionAgentMenuOpen(false);
                    setSessionNodeMenuOpen(false);
                    clearHomeSessionUrl();
                    setSelectedWorkItemId("");
                    setContextClosed(false);
                    setComposerMode("clean");
                  }}
                  type="button"
                >
                  <TerminalSquare className="h-4 w-4" />
                  <span>Sessions</span>
                </button>
                <button
                  className={cn(
                    "inline-flex min-h-8 min-w-0 items-center justify-center gap-2 rounded-sm px-2 text-xs font-medium transition",
                    homeRailTab === "inbox"
                      ? "bg-accent/15 text-accent-bright"
                      : "text-ink-tertiary hover:bg-surface-2 hover:text-ink-muted",
                  )}
                  onClick={() => {
                    setHomeRailTab("inbox");
                    setSessionAgentMenuOpen(false);
                    setSessionNodeMenuOpen(false);
                    setEmbeddedSessionTarget(null);
                    clearHomeSessionUrl();
                    setSelectedWorkItemId("");
                    setContextClosed(false);
                    setComposerMode("clean");
                  }}
                  type="button"
                >
                  <Inbox className="h-4 w-4" />
                  <span>Inbox</span>
                  <Badge className="max-w-10">{needsActionCount}</Badge>
                </button>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="text-sm font-medium">{railTitle}</div>
                    {homeRailTab === "inbox" && (
                      <Badge className="max-w-24">
                        {visibleWorkItems.length}
                      </Badge>
                    )}
                  </div>
                  <TruncatedText
                    className="mt-1 text-xs text-ink-tertiary"
                    tooltip={railSubtitle}
                  >
                    {railSubtitle}
                  </TruncatedText>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {homeRailTab === "sessions" && (
                    <>
                      <InboxMenu
                        icon={<ListFilter className="h-4 w-4" />}
                        label="Filter by agent"
                        onOpenChange={(open) => {
                          setSessionAgentMenuOpen(open);
                          if (open) {
                            setSessionNodeMenuOpen(false);
                          }
                        }}
                        open={sessionAgentMenuOpen}
                        options={sessionAgentFilterOptions}
                        selectedValue={effectiveSessionAgentFilter}
                        onSelect={(value) => {
                          setSessionAgentFilter(value);
                          setSessionAgentMenuOpen(false);
                          setEmbeddedSessionTarget(null);
                          clearHomeSessionUrl();
                          setSelectedWorkItemId("");
                          setContextClosed(false);
                          setComposerMode("clean");
                        }}
                      />
                      <InboxMenu
                        icon={<Server className="h-4 w-4" />}
                        label="Filter by node"
                        onOpenChange={(open) => {
                          setSessionNodeMenuOpen(open);
                          if (open) {
                            setSessionAgentMenuOpen(false);
                          }
                        }}
                        open={sessionNodeMenuOpen}
                        options={sessionNodeFilterOptions}
                        selectedValue={effectiveSessionNodeFilter}
                        onSelect={(value) => {
                          setSessionNodeFilter(value);
                          setSessionNodeMenuOpen(false);
                          setEmbeddedSessionTarget(null);
                          clearHomeSessionUrl();
                          setSelectedWorkItemId("");
                          setContextClosed(false);
                          setComposerMode("clean");
                        }}
                      />
                      <Button
                        className="shrink-0"
                        icon={<Plus className="h-3.5 w-3.5" />}
                        onClick={showCleanComposer}
                        size="sm"
                        tooltip="Start a new chat"
                        type="button"
                        variant="primary"
                      >
                        New chat
                      </Button>
                    </>
                  )}
                  {homeRailTab === "inbox" && (
                    <InboxMenu
                      icon={<ListFilter className="h-4 w-4" />}
                      label="Filter by"
                      onOpenChange={setFilterMenuOpen}
                      open={filterMenuOpen}
                      options={inboxFilters}
                      selectedValue={inboxFilter}
                      onSelect={(value) => {
                        setInboxFilter(value as InboxFilter);
                        setFilterMenuOpen(false);
                        setSelectedWorkItemId("");
                        setContextClosed(false);
                        setComposerMode("clean");
                      }}
                    />
                  )}
                  {homeRailTab === "inbox" && (
                    <InboxMenu
                      icon={<MoreHorizontal className="h-4 w-4 rotate-90" />}
                      label="Order by"
                      onOpenChange={setOrderMenuOpen}
                      open={orderMenuOpen}
                      options={inboxOrders}
                      selectedValue={inboxOrder}
                      onSelect={(value) => {
                        setInboxOrder(value as InboxOrder);
                        setOrderMenuOpen(false);
                        setSelectedWorkItemId("");
                        setContextClosed(false);
                        setComposerMode("clean");
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
            <div className="grid">
              {visibleWorkItems.map((item) => (
                <WorkItemRow
                  item={item}
                  key={item.id}
                  onSelect={() => {
                    setEmbeddedSessionTarget(null);
                    if (item.kind === "session" && item.sessionId) {
                      replaceHomeSessionUrl(item.sessionId);
                    } else {
                      clearHomeSessionUrl();
                    }
                    setSelectedWorkItemId(item.id);
                    setMobileComposerOpen(false);
                    setMobileRailOpen(false);
                    setContextClosed(false);
                    setComposerMode("clean");
                  }}
                  selected={
                    item.id === selectedWorkItem?.id ||
                    (item.kind === "session" &&
                      item.sessionId === activeSessionTarget?.sessionId)
                  }
                />
              ))}
              {homeRailTab === "sessions" &&
                sessionsQuery.isFetchingNextPage && (
                  <div className="border-b border-hairline px-4 py-3 text-sm text-ink-tertiary">
                    Loading more sessions...
                  </div>
                )}
              {visibleWorkItems.length === 0 && (
                <div className="p-4 text-sm text-ink-tertiary">
                  {homeRailTab === "sessions" && sessionsQuery.isLoading
                    ? "Loading sessions..."
                    : homeRailTab === "sessions" &&
                        fleetSetupGuideKind === "node"
                      ? "No nodes yet. Use the setup guide on the right."
                      : homeRailTab === "sessions" &&
                          fleetSetupGuideKind === "agent"
                        ? "No agents yet. Create the first paxd connection with the guide on the right."
                        : "No items match this view."}
                </div>
              )}
            </div>
          </section>

          <section
            className={cn(
              "min-h-0 min-w-0 flex-col overflow-hidden",
              mobilePaneOpen ? "flex" : "hidden lg:flex",
            )}
          >
            {activeSessionTargetPending ? (
              <section className="flex min-h-0 flex-1 items-center justify-center p-5 text-sm text-ink-tertiary">
                Loading session...
              </section>
            ) : activeSessionTarget ? (
              <SessionWorkbench
                agentId={activeSessionTarget.agentId}
                embedded
                initialApprovalMode={activeSessionTarget.initialApprovalMode}
                initialAttachments={activeSessionTarget.initialAttachments}
                initialCwd={activeSessionTarget.initialCwd}
                initialPrompt={activeSessionTarget.initialPrompt}
                key={activeSessionTarget.key}
                mobileMenuLabel="Chat sidebar"
                nodeId={activeSessionTarget.nodeId}
                onMobileMenu={() => setMobileRailOpen(true)}
                onSessionAssigned={(sessionId) => {
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.userSessionsRoot(user.user_id),
                  });
                  const nextTarget = {
                    ...activeSessionTarget,
                    sessionId,
                  };
                  setEmbeddedSessionTarget(nextTarget);
                  replaceHomeSessionUrl(sessionId);
                }}
                sessionId={activeSessionTarget.sessionId}
                user={user}
              />
            ) : fleetSetupGuideKind ? (
              <div className="min-h-0 flex-1 overflow-auto p-5">
                <div className="mx-auto w-full max-w-4xl">
                  <PaxdGettingStartedGuide kind={fleetSetupGuideKind} />
                </div>
              </div>
            ) : (
              <>
                <div className="flex min-w-0 items-center gap-2 border-b border-hairline bg-surface-1 px-3 py-2 lg:hidden">
                  <Button
                    aria-label="Open Home sidebar"
                    icon={<Menu className="h-4 w-4" />}
                    onClick={() => setMobileRailOpen(true)}
                    size="icon"
                    tooltip="Open Home sidebar"
                    type="button"
                    variant="ghost"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-ink">
                      {mobileDetailTitle}
                    </div>
                    <div className="truncate text-xs text-ink-tertiary">
                      {composerContextItem?.title ?? "New session composer"}
                    </div>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-auto p-5">
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
                  className="mobile-safe-bottom border-t border-hairline bg-surface-1 p-3"
                  onSubmit={submit}
                >
                  <div className="mx-auto w-full max-w-4xl rounded-xl border border-hairline bg-surface-2 px-3 py-2 transition focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_rgb(94_106_210/14%),0_0_28px_rgb(94_106_210/10%)]">
                    <ComposerModeHint
                      mode={composerMode}
                      onClear={() => {
                        setComposerMode("clean");
                        setDraft("");
                      }}
                    />
                    <input
                      className="sr-only"
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
                    {composerAttachmentError && (
                      <div className="mb-2 text-xs text-warning">
                        {composerAttachmentError.name}:{" "}
                        {composerAttachmentError.message}
                      </div>
                    )}
                    <textarea
                      className="max-h-40 min-h-12 w-full resize-none overflow-y-auto bg-transparent px-1 py-1 text-sm leading-5 text-ink outline-none [field-sizing:content] placeholder:text-ink-tertiary"
                      onKeyDown={handleComposerKeyDown}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={composerPlaceholder(composerMode)}
                      rows={2}
                      value={draft}
                    />
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label="Add files or context"
                            disabled={composerAttachmentUploadPending}
                            icon={
                              composerAttachmentUploadPending ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Plus className="h-4 w-4" />
                              )
                            }
                            size="icon"
                            tooltip="Add files or context"
                            type="button"
                            variant="ghost"
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="start"
                          className="w-52"
                          side="top"
                        >
                          <DropdownMenuItem
                            onSelect={() =>
                              composerFileInputRef.current?.click()
                            }
                          >
                            <Paperclip className="h-4 w-4" />
                            Attach files
                          </DropdownMenuItem>
                          {showAdminFeatures && (
                            <DropdownMenuItem
                              disabled={!selectedInquiry}
                              onSelect={() => {
                                if (selectedInquiry) {
                                  setComposerMode("summarize-note");
                                  setAttachmentName("summarize note");
                                }
                              }}
                            >
                              <Paperclip className="h-4 w-4" />
                              Summarize with note
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {newSessionWorkspaceOpen ? (
                        <label
                          className={cn(
                            "order-first inline-flex min-h-9 min-w-0 basis-full items-center gap-2 rounded-lg border bg-canvas px-2.5 text-sm transition sm:order-none sm:max-w-80 sm:basis-auto sm:flex-1",
                            newSessionCwdInvalid
                              ? "border-warning text-warning"
                              : "border-hairline text-ink-muted focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25",
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
                            placeholder="~/project"
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
                      <button
                        aria-label={
                          newSessionApprovalMode === "auto_approve_all"
                            ? "Auto approve tools without asking"
                            : "Ask before running tools"
                        }
                        aria-pressed={
                          newSessionApprovalMode === "auto_approve_all"
                        }
                        className={cn(
                          "inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-sm transition",
                          newSessionApprovalMode === "auto_approve_all"
                            ? "bg-success/10 text-success"
                            : "text-ink-subtle hover:bg-surface-3 hover:text-ink",
                        )}
                        onClick={() =>
                          setNewSessionApprovalMode((mode) =>
                            mode === "auto_approve_all"
                              ? "manual"
                              : "auto_approve_all",
                          )
                        }
                        type="button"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span className="whitespace-nowrap text-xs sm:text-sm">
                          {newSessionApprovalMode === "auto_approve_all"
                            ? "Auto approve tools"
                            : "Ask before tools"}
                        </span>
                      </button>
                      {attachmentName && (
                        <Badge className="max-w-40" tooltip={attachmentName}>
                          {attachmentName}
                        </Badge>
                      )}
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <AgentSelector
                          agents={agents}
                          nodes={nodes}
                          selectedAgentId={activeAgent?.agent_id}
                          onChange={setSelectedAgentId}
                        />
                        <Button
                          disabled={
                            !activeAgent?.agent_id ||
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
                  </div>
                </form>
              </>
            )}
          </section>
        </main>
      </div>
    </ConsoleLayout>
  );
}

function WorkItemRow({
  item,
  onSelect,
  selected,
}: {
  item: WorkItem;
  onSelect: () => void;
  selected: boolean;
}) {
  if (item.kind === "session") {
    return (
      <Link
        className={cn(
          "grid min-w-0 gap-1 border-b border-hairline px-4 py-3 text-left transition hover:bg-surface-2",
          selected
            ? "bg-accent/10 shadow-[inset_2px_0_0_var(--color-accent)] hover:bg-accent/15"
            : "bg-surface-1",
        )}
        href={item.href}
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
        <TruncatedText className="text-sm font-medium text-ink">
          {item.title}
        </TruncatedText>
        <TruncatedText className="text-xs text-ink-tertiary">
          {item.context} · {relativeTime(item.createdAt)}
        </TruncatedText>
      </Link>
    );
  }

  return (
    <button
      className={cn(
        "group grid min-w-0 gap-2 border-b border-hairline px-4 py-3 text-left transition hover:bg-surface-2",
        selected
          ? "bg-accent/10 shadow-[inset_2px_0_0_var(--color-accent)] hover:bg-accent/15"
          : "bg-surface-1",
      )}
      onClick={onSelect}
      type="button"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
            item.priority === "high"
              ? "border-warning/30 bg-warning/10 text-warning"
              : "border-hairline bg-canvas text-ink-subtle",
          )}
        >
          {kindIcon[item.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <TruncatedText className="text-sm font-medium text-ink">
              {item.title}
            </TruncatedText>
            {item.priority === "high" ? (
              <Badge className="max-w-24" tone="warning">
                {item.kind}
              </Badge>
            ) : (
              <span className="shrink-0 text-xs text-ink-tertiary">
                {item.kind}
              </span>
            )}
          </div>
          <TruncatedText className="mt-1 text-xs text-ink-tertiary">
            {item.source} · {relativeTime(item.createdAt)}
          </TruncatedText>
        </div>
      </div>
      <div className="flex min-w-0 items-center justify-between gap-3 pl-10">
        <TruncatedText className="text-xs text-ink-subtle">
          {item.context}
        </TruncatedText>
        <span className="shrink-0 text-xs text-ink-tertiary transition group-hover:text-accent-bright">
          {item.actionLabel}
        </span>
      </div>
    </button>
  );
}

function InboxMenu({
  icon,
  label,
  onOpenChange,
  onSelect,
  open,
  options,
  selectedValue,
}: {
  icon: React.ReactNode;
  label: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (value: string) => void;
  open: boolean;
  options: Array<{ label: string; value: string }>;
  selectedValue: string;
}) {
  const selected = options.find((option) => option.value === selectedValue);

  return (
    <div className="relative">
      <Button
        icon={icon}
        onClick={() => onOpenChange(!open)}
        size="icon"
        tooltip={`${label}: ${selected?.label ?? selectedValue}`}
        type="button"
        variant="ghost"
      />
      {open && (
        <div className="absolute right-0 top-10 z-20 grid w-44 overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-xl shadow-black/30">
          <div className="border-b border-hairline px-3 py-2 text-xs text-ink-tertiary">
            {label}
          </div>
          {options.map((option) => (
            <button
              className={cn(
                "flex min-h-9 items-center justify-between gap-3 px-3 text-left text-sm transition hover:bg-surface-2 hover:text-ink",
                option.value === selectedValue ? "text-ink" : "text-ink-muted",
              )}
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              <TruncatedText className="min-w-0 flex-1" tooltip={option.label}>
                {option.label}
              </TruncatedText>
              {option.value === selectedValue && (
                <span className="h-1.5 w-1.5 rounded-full bg-accent-bright" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ComposerModeHint({
  mode,
  onClear,
}: {
  mode: ComposerMode;
  onClear: () => void;
}) {
  if (mode === "clean") {
    return (
      <div className="mb-1 px-1 text-xs text-ink-tertiary">Clean session</div>
    );
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
      <section className="flex min-h-[160px] items-center justify-center px-4 py-10 text-center">
        <div className="grid gap-1.5">
          <div className="text-sm text-ink-muted">
            What should we work on today?
          </div>
          <div className="text-xs text-ink-tertiary">
            Type below to start a session · Enter to send, Shift+Enter for a new
            line
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
    <div
      className="relative min-w-0"
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        if (
          !(nextTarget instanceof globalThis.Node) ||
          !event.currentTarget.contains(nextTarget)
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        className="inline-flex min-h-9 max-w-48 items-center gap-2 rounded-lg border border-transparent bg-transparent py-1 pl-2 pr-2 text-sm text-ink-muted outline-none transition hover:bg-surface-3 focus:border-hairline-strong"
        disabled={agents.length === 0}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="relative grid h-4 w-4 shrink-0 place-items-center">
          <Bot className="h-4 w-4 text-ink-tertiary" />
          {selectedAgent?.online && <OnlineDot className="-right-0.5 -top-1" />}
        </span>
        <TruncatedText className="min-w-0 max-w-28">
          {selectedLabel}
        </TruncatedText>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-tertiary" />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 min-w-56 overflow-hidden rounded-lg border border-hairline bg-surface-2 py-1 shadow-xl">
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
        </div>
      )}
    </div>
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
            ? `/sessions/${encodeURIComponent(approval.request_session_id)}`
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
          priority: session.run_status === "waiting_approval" ? "high" : "low",
          sessionId: session.session_id,
          source: "Recent session",
          title: session.name ?? session.current_task ?? session.session_id,
        };
      }),
    ],
    (item) => item.createdAt,
  );
}

function homeApprovalOptions(approval: AgentApproval) {
  const options = (approval.options ?? [])
    .filter((option) => option.option_id)
    .map((option) => ({
      label: option.label ?? approvalOptionLabel(option.option_id!),
      optionId: option.option_id!,
    }));

  return options.length
    ? options
    : [
        { label: "Allow once", optionId: "allow_once" },
        { label: "Allow for agent", optionId: "allow_for_this_agent" },
        { label: "Deny", optionId: "deny" },
      ];
}

function approvalOptionLabel(optionId: string) {
  return optionId
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function homeSessionHref(session: AgentSession) {
  return `/sessions/${encodeURIComponent(session.session_id)}`;
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

  const params = new URLSearchParams({ sessionId });
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
    { label: "All agents", value: allSessionAgentsValue },
    ...[...sessionAgentOptions.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ label, value })),
  ];
}

function buildSessionNodeFilterOptions(nodes: Node[]) {
  const nodeDisplayLabels = buildNodeDisplayLabels(nodes);

  return [
    { label: "All nodes", value: allSessionNodesValue },
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

function filterAndOrderWorkItems(
  items: WorkItem[],
  tab: HomeRailTab,
  filter: InboxFilter,
  order: InboxOrder,
  sessionAgentFilter: string,
  sessionNodeFilter: string,
) {
  if (tab === "sessions") {
    return byRecent(
      items.filter(
        (item) =>
          item.kind === "session" &&
          (sessionAgentFilter === allSessionAgentsValue ||
            item.agentId === sessionAgentFilter) &&
          (sessionNodeFilter === allSessionNodesValue ||
            item.nodeId === sessionNodeFilter),
      ),
      (item) => item.createdAt,
    );
  }

  const filtered = items.filter((item) => {
    if (filter === "inquiries") {
      return item.kind === "inquiry";
    }

    if (filter === "needs-action") {
      return item.kind !== "session";
    }

    return item.kind !== "session";
  });

  return orderWorkItems(filtered, order);
}

function orderWorkItems(items: WorkItem[], order: InboxOrder) {
  if (order === "priority") {
    return [...items].sort((left, right) => {
      const priorityDelta =
        priorityRank(right.priority) - priorityRank(left.priority);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return timeValue(right.createdAt) - timeValue(left.createdAt);
    });
  }

  return byRecent(items, (item) => item.createdAt);
}

function removeArchivedWorkItems(items: WorkItem[], archivedIds: string[]) {
  if (archivedIds.length === 0) {
    return items;
  }

  const archived = new Set(archivedIds);
  return items.filter((item) => !archived.has(item.id));
}

function filterLabel(filter: InboxFilter) {
  return (
    inboxFilters.find((option) => option.value === filter)?.label ?? filter
  );
}

function orderLabel(order: InboxOrder) {
  const label = inboxOrders.find((option) => option.value === order)?.label;
  return `Order: ${label ?? order}`;
}

function priorityRank(priority: WorkItem["priority"]) {
  if (priority === "high") {
    return 3;
  }

  if (priority === "medium") {
    return 2;
  }

  return 1;
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

function agentLabel(agent: Agent) {
  return agent.name ?? agent.agent_type ?? agent.agent_id;
}

function nodeLabel(node: Node) {
  return node.name ?? node.hostname ?? node.node_id;
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
