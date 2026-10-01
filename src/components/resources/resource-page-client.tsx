"use client";

import Link from "next/link";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Plus,
  Radio,
  Server,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { PaxdGettingStartedGuide } from "@/components/connect/paxd-getting-started";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  createApiKey,
  createNodeRegistrationToken,
  decideApproval,
  deleteApiKey,
  deleteAgent,
  deleteNode,
  listAgentSessions,
  revokeApprovalGrant,
  useAgents,
  useApiKeys,
  useApprovalGrants,
  useApprovals,
  useHealth,
  useNodes,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import {
  Agent,
  AgentApproval,
  Node,
  User,
} from "@/features/api/types";
import { compactId } from "@/lib/format";
import {
  deleteRootKey,
  loadRootKey,
  saveRootKey,
} from "@/features/e2ee/root-key-store";
import { generateEncodedRootKey } from "@/features/e2ee/envelope";
import {
  AgentRow,
  agentLabel,
  buildAgentRows,
  buildSessionRows,
  byLastActiveDesc,
  isActiveAgent,
  isActiveNode,
  isActiveSession,
  nodeLabel,
  paginateItems,
  resourceLastActiveAt,
  sessionUpdatedAt,
  SessionRow,
} from "./resource-models";
import { ServiceStatusPanel } from "@/components/settings/service-status-panel";
import {
  SettingsBack,
  settingsLinks,
} from "@/components/settings/settings-navigation";
import { NodeMaintenanceActions } from "./node-maintenance-actions";

type ResourceKind =
  | "nodes"
  | "agents"
  | "sessions"
  | "approvals"
  | "security"
  | "grants"
  | "encryption"
  | "monitor"
  | "api-keys"
  | "node-registration";

type ResourcePageClientProps = {
  kind: ResourceKind;
  user: User;
};

const copy: Record<
  ResourceKind,
  { title: string; eyebrow: string; icon: ReactNode }
> = {
  nodes: {
    title: "Devices",
    eyebrow: "computers and servers",
    icon: <Server className="h-4 w-4" />,
  },
  agents: {
    title: "Agents",
    eyebrow: "active node agents",
    icon: <Bot className="h-4 w-4" />,
  },
  sessions: {
    title: "Sessions",
    eyebrow: "recent work",
    icon: <TerminalSquare className="h-4 w-4" />,
  },
  approvals: {
    title: "Approvals",
    eyebrow: "human decisions",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  security: {
    title: "Security",
    eyebrow: "persistent agent grants",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  grants: {
    title: "Allowed actions",
    eyebrow: "permissions previously given to agents",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  encryption: {
    title: "Encrypted chats",
    eyebrow: "browser access and encryption keys",
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  monitor: {
    title: "Service status",
    eyebrow: "service and resource connections",
    icon: <Radio className="h-4 w-4" />,
  },
  "api-keys": {
    title: "API keys",
    eyebrow: "access management",
    icon: <KeyRound className="h-4 w-4" />,
  },
  "node-registration": {
    title: "Manual device registration",
    eyebrow: "bootstrap access",
    icon: <Settings2 className="h-4 w-4" />,
  },
};

const emptyNodes: Node[] = [];
const emptyAgents: Agent[] = [];
const sessionPageSize = 50;

export function ResourcePageClient({ kind, user }: ResourcePageClientProps) {
  const [showAllResources, setShowAllResources] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);
  const nodesQuery = useNodes(
    [
      "nodes",
      "agents",
      "sessions",
      "monitor",
      "security",
      "encryption",
    ].includes(kind)
      ? user.user_id
      : undefined,
  );
  const shouldLoadAgents =
    kind === "agents" ||
    kind === "sessions" ||
    kind === "monitor" ||
    kind === "security" ||
    kind === "encryption";
  const agentsQuery = useAgents(
    shouldLoadAgents ? user.user_id : undefined,
    kind === "agents" || kind === "security" || kind === "encryption"
      ? "owned"
      : "accessible",
    kind === "monitor" ? 30_000 : undefined,
  );
  const allNodes = nodesQuery.data?.nodes ?? emptyNodes;
  const sortedNodes = useMemo(
    () =>
      byLastActiveDesc(allNodes, resourceLastActiveAt, (node) =>
        nodeLabel(node),
      ),
    [allNodes],
  );
  const nodes = useMemo(
    () =>
      showAllResources
        ? sortedNodes
        : sortedNodes.filter((node) => isActiveNode(node)),
    [showAllResources, sortedNodes],
  );
  const allAgents = agentsQuery.data?.agents ?? emptyAgents;
  const sortedAgents = useMemo(
    () =>
      byLastActiveDesc(allAgents, resourceLastActiveAt, (agent) =>
        agentLabel(agent),
      ),
    [allAgents],
  );
  const agents = useMemo(
    () =>
      showAllResources
        ? sortedAgents
        : sortedAgents.filter((agent) => isActiveAgent(agent)),
    [showAllResources, sortedAgents],
  );
  const agentRows = useMemo(
    () => buildAgentRows(agents, sortedNodes),
    [agents, sortedNodes],
  );
  const agentsLoading = agentsQuery.isLoading;
  const sessionQueries = useQueries({
    queries: sortedAgents.map((agent) => {
      const nodeId = agent.node_id;
      return {
        queryKey: queryKeys.sessions(
          user.user_id,
          nodeId ?? "unassigned",
          agent.agent_id,
        ),
        queryFn: () =>
          nodeId
            ? listAgentSessions(user.user_id, nodeId, agent.agent_id)
            : Promise.resolve({ sessions: [] }),
        enabled:
          Boolean(user.user_id && nodeId && agent.agent_id) &&
          (kind === "sessions" || kind === "monitor"),
      };
    }),
  });
  const allSessions = sessionQueries.flatMap(
    (query) => query.data?.sessions ?? [],
  );
  const sortedSessionRows = useMemo(
    () =>
      byLastActiveDesc(
        buildSessionRows(allSessions, sortedAgents, sortedNodes),
        sessionUpdatedAt,
        (session) => session.name ?? session.session_id,
      ),
    [allSessions, sortedAgents, sortedNodes],
  );
  const sessionRows = useMemo(
    () =>
      showAllResources
        ? sortedSessionRows
        : sortedSessionRows.filter((session) => isActiveSession(session)),
    [showAllResources, sortedSessionRows],
  );
  const paginatedSessions = useMemo(
    () => paginateItems(sessionRows, sessionPage, sessionPageSize),
    [sessionPage, sessionRows],
  );
  const sessionsLoading =
    agentsLoading || sessionQueries.some((query) => query.isLoading);
  const healthQuery = useHealth(kind === "monitor");
  const apiKeysQuery = useApiKeys(
    kind === "api-keys" ? user.user_id : undefined,
  );
  const approvalsQuery = useApprovals(
    kind === "approvals" ? user.user_id : undefined,
  );
  const approvalGrantsQuery = useApprovalGrants(
    kind === "approvals" || kind === "security" || kind === "grants"
      ? user.user_id
      : undefined,
  );
  const meta = copy[kind];
  const apiError =
    nodesQuery.error ??
    agentsQuery.error ??
    firstQueryError(sessionQueries) ??
    healthQuery.error ??
    apiKeysQuery.error ??
    approvalsQuery.error ??
    approvalGrantsQuery.error ??
    null;

  function handleShowAllResourcesChange(checked: boolean) {
    setShowAllResources(checked);
    setSessionPage(1);
  }

  return (
    <ConsoleLayout user={user}>
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="border-b border-hairline px-4 py-4 sm:px-5">
          <SettingsBack
            href={
              [
                "api-keys",
                "node-registration",
                "security",
                "grants",
                "encryption",
              ].includes(kind)
                ? settingsLinks.advanced
                : settingsLinks.home
            }
            label={
              [
                "api-keys",
                "node-registration",
                "security",
                "grants",
                "encryption",
              ].includes(kind)
                ? "Advanced settings"
                : "Settings"
            }
          />
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-ink-tertiary">
                {meta.icon}
                {meta.eyebrow}
              </div>
              <h1 className="mt-2 text-2xl font-semibold">{meta.title}</h1>
            </div>
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <ResourceSectionTabs kind={kind} />
              {kind === "nodes" && (
                <Button
                  asChild
                  icon={<Plus className="h-4 w-4" />}
                  variant="primary"
                >
                  <Link href={settingsLinks.addDevice}>Add device</Link>
                </Button>
              )}
              {supportsActiveFilter(kind) && (
                <ActiveFilterToggle
                  checked={showAllResources}
                  onChange={handleShowAllResourcesChange}
                />
              )}
            </div>
          </div>
        </header>

        {apiError && (
          <div className="px-5 pt-4">
            <ApiNotice error={apiError} />
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
          {kind === "nodes" && (
            <NodeGrid
              isLoading={nodesQuery.isLoading}
              nodes={nodes}
              totalCount={sortedNodes.length}
              userId={user.user_id}
            />
          )}
          {kind === "agents" && (
            <AgentGrid
              agents={agentRows}
              isLoading={agentsLoading}
              nodeLabel={`${nodes.length}/${sortedNodes.length} nodes in scope`}
              totalCount={sortedAgents.length}
              userId={user.user_id}
            />
          )}
          {kind === "sessions" && (
            <SessionGrid
              filteredCount={sessionRows.length}
              isLoading={sessionsLoading}
              onPageChange={setSessionPage}
              page={paginatedSessions.currentPage}
              pageCount={paginatedSessions.pageCount}
              pageEnd={paginatedSessions.endIndex}
              pageStart={paginatedSessions.startIndex}
              sessions={paginatedSessions.items}
              totalCount={sortedSessionRows.length}
            />
          )}
          {(kind === "approvals" ||
            kind === "security" ||
            kind === "grants" ||
            kind === "encryption") && (
            <div className="grid gap-4">
              {(kind === "security" || kind === "encryption") && (
                <E2EEKeysPanel agents={sortedAgents} nodes={sortedNodes} />
              )}
              {kind !== "encryption" && (
                <ApprovalsPanel
                  approvals={approvalsQuery.data?.approvals ?? []}
                  grants={approvalGrantsQuery.data?.grants ?? []}
                  isLoading={
                    approvalsQuery.isLoading || approvalGrantsQuery.isLoading
                  }
                  showPending={kind === "approvals"}
                  userId={user.user_id}
                />
              )}
            </div>
          )}
          {kind === "monitor" && (
            <ServiceStatusPanel
              nodes={nodesQuery.data?.nodes}
              agents={agentsQuery.data?.agents}
              health={healthQuery.data}
              loading={
                nodesQuery.isLoading ||
                agentsQuery.isLoading ||
                healthQuery.isLoading
              }
              error={Boolean(
                nodesQuery.error || agentsQuery.error || healthQuery.error,
              )}
              recentSessions={
                agentsQuery.error ||
                sessionsLoading ||
                firstQueryError(sessionQueries)
                  ? undefined
                  : allSessions.length
              }
              refreshing={
                nodesQuery.isFetching ||
                agentsQuery.isFetching ||
                healthQuery.isFetching
              }
              refresh={() => {
                void nodesQuery.refetch();
                void agentsQuery.refetch();
                void healthQuery.refetch();
                sessionQueries.forEach((query) => {
                  void query.refetch();
                });
              }}
            />
          )}
          {kind === "api-keys" && (
            <ApiKeysPanel
              apiKeys={apiKeysQuery.data?.api_keys ?? []}
              isLoading={apiKeysQuery.isLoading}
              userId={user.user_id}
            />
          )}
          {kind === "node-registration" && (
            <NodeRegistrationPanel userId={user.user_id} />
          )}
        </div>
      </div>
    </ConsoleLayout>
  );
}

function ResourceSectionTabs({ kind }: { kind: ResourceKind }) {
  const tabs =
    kind === "nodes" || kind === "agents"
      ? [
          {
            href: "/settings/devices?view=nodes",
            label: "Devices",
            value: "nodes",
          },
          {
            href: "/settings/devices?view=agents",
            label: "Agents",
            value: "agents",
          },
        ]
      : [];

  if (!tabs.length) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 rounded-md border border-hairline bg-surface-1 p-0.5 sm:flex">
      {tabs.map((tab) => (
        <Link
          aria-current={kind === tab.value ? "page" : undefined}
          className={`flex min-h-10 items-center justify-center rounded px-3 py-1.5 text-sm transition sm:text-xs ${
            kind === tab.value
              ? "bg-accent/15 text-ink"
              : "text-ink-tertiary hover:bg-surface-2 hover:text-ink"
          }`}
          href={tab.href}
          key={tab.value}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function NodeGrid({
  isLoading,
  nodes,
  totalCount,
  userId,
}: {
  isLoading: boolean;
  nodes: Node[];
  totalCount: number;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const removeNode = useMutation({
    mutationFn: (node: Node) => deleteNode(userId, node.node_id),
    onError: (error) => setDeleteError(error),
    onSuccess: () => {
      setNodeToDelete(null);
      setDeleteError(null);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.user(userId),
      });
    },
  });

  if (isLoading) {
    return <EmptyState label="Loading nodes" />;
  }

  return (
    <div className="grid gap-3">
      {deleteError && <ApiNotice error={deleteError} />}
      {nodes.length > 0 ? (
        <div className="grid min-w-0 overflow-hidden rounded-lg border border-hairline">
          {nodes.map((node) => (
            <article
              className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 transition last:border-b-0 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_180px_120px_132px]"
              key={node.node_id}
            >
              <Link className="contents" href={`/nodes/${node.node_id}`}>
                <div className="min-w-0">
                  <TruncatedText className="text-sm font-medium">
                    {node.name ?? node.hostname ?? node.node_id}
                  </TruncatedText>
                  {node.description && (
                    <TruncatedText className="mt-1 text-xs text-ink-muted">
                      {node.description}
                    </TruncatedText>
                  )}
                </div>
                <div className="grid min-w-0 gap-1">
                  <MonoId>
                    {node.os ?? "unknown os"} / {node.arch ?? "unknown arch"}
                  </MonoId>
                  <MonoId tooltip={node.node_id}>
                    {compactId(node.node_id)}
                  </MonoId>
                </div>
                <div className="flex items-start sm:justify-end">
                  <Badge tone={node.online ? "success" : "neutral"}>
                    {node.online ? "online" : "offline"}
                  </Badge>
                </div>
              </Link>
              <div className="flex items-start justify-end gap-1">
                <NodeMaintenanceActions
                  currentVersion={node.paxd_version}
                  disabled={!node.online || removeNode.isPending}
                  nodeArch={node.arch}
                  nodeId={node.node_id}
                  nodeLabel={node.name ?? node.hostname ?? node.node_id}
                  nodeOS={node.os}
                  userId={userId}
                />
                <ConfirmDialog
                  confirmLabel={
                    removeNode.isPending ? "Deleting..." : "Delete node"
                  }
                  description={
                    <>
                      This removes{" "}
                      <span className="font-medium text-ink">
                        {nodeToDelete?.name ??
                          nodeToDelete?.hostname ??
                          nodeToDelete?.node_id}
                      </span>{" "}
                      from the fleet view. Agents hosted on this node will be
                      cleaned up at the same time.
                    </>
                  }
                  disabled={removeNode.isPending}
                  onConfirm={() => {
                    if (nodeToDelete) {
                      removeNode.mutate(nodeToDelete);
                    }
                  }}
                  onOpenChange={(open) => {
                    if (!open) {
                      setNodeToDelete(null);
                    }
                  }}
                  open={nodeToDelete?.node_id === node.node_id}
                  title="Delete node?"
                >
                  <Button
                    disabled={removeNode.isPending}
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setNodeToDelete(node)}
                    size="icon"
                    tooltip="Delete node"
                    type="button"
                    variant="danger"
                  />
                </ConfirmDialog>
              </div>
            </article>
          ))}
        </div>
      ) : totalCount > 0 ? (
        <EmptyState label="No active nodes" />
      ) : (
        <PaxdGettingStartedGuide kind="node" />
      )}
    </div>
  );
}

function AgentGrid({
  agents,
  isLoading,
  nodeLabel,
  totalCount,
  userId,
}: {
  agents: AgentRow[];
  isLoading: boolean;
  nodeLabel?: string;
  totalCount: number;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [deleteError, setDeleteError] = useState<Error | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<AgentRow | null>(null);
  const removeAgent = useMutation({
    mutationFn: (agent: AgentRow) => deleteAgent(userId, agent.agent_id),
    onError: (error) => setDeleteError(error),
    onSuccess: () => {
      setAgentToDelete(null);
      setDeleteError(null);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.user(userId),
      });
    },
  });

  if (isLoading) {
    return <EmptyState label="Loading agents" />;
  }

  return (
    <div className="grid gap-3">
      {deleteError && <ApiNotice error={deleteError} />}
      <div className="flex min-w-0 text-sm text-ink-tertiary">
        <span className="shrink-0">Scope:&nbsp;</span>
        <TruncatedText>{nodeLabel ?? "No node selected"}</TruncatedText>
      </div>
      {agents.length > 0 ? (
        <div className="grid min-w-0 overflow-hidden rounded-lg border border-hairline">
          {agents.map((agent) => (
            <article
              className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 transition last:border-b-0 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_220px_120px_40px]"
              key={agent.agent_id}
            >
              <Link
                className="contents"
                href={
                  agent.node_id
                    ? `/agents/${agent.agent_id}?nodeId=${agent.node_id}`
                    : `/agents/${agent.agent_id}`
                }
              >
                <div className="min-w-0">
                  <TruncatedText className="text-sm font-medium">
                    {agent.name ?? agent.agent_type ?? agent.agent_id}
                  </TruncatedText>
                  <TruncatedText className="mt-1 text-xs text-ink-muted">
                    {agent.description ?? agentCardSummary(agent)}
                  </TruncatedText>
                </div>
                <div className="grid min-w-0 content-start gap-1">
                  <TruncatedText
                    className="text-xs text-ink-muted"
                    tooltip={agent.nodeLabel}
                  >
                    Node: {agent.nodeLabel}
                  </TruncatedText>
                  <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
                    <MonoId tooltip={agent.node_id ?? "No runtime node"}>
                      node {compactId(agent.node_id, 10, 6, "unassigned")}
                    </MonoId>
                    <MonoId tooltip={agent.agent_id}>
                      agent {compactId(agent.agent_id)}
                    </MonoId>
                  </div>
                </div>
                <div className="flex items-start sm:justify-end">
                  <Badge tone={agent.online ? "success" : "neutral"}>
                    {agent.online ? "online" : (agent.status ?? "unknown")}
                  </Badge>
                </div>
              </Link>
              <div className="flex items-start justify-end">
                <ConfirmDialog
                  confirmLabel={
                    removeAgent.isPending ? "Deleting..." : "Delete agent"
                  }
                  description={
                    <>
                      This removes{" "}
                      <span className="font-medium text-ink">
                        {agentToDelete?.name ??
                          agentToDelete?.agent_type ??
                          agentToDelete?.agent_id}
                      </span>{" "}
                      from the agents list. Other agents on the same node are
                      not affected.
                    </>
                  }
                  disabled={removeAgent.isPending}
                  onConfirm={() => {
                    if (agentToDelete) {
                      removeAgent.mutate(agentToDelete);
                    }
                  }}
                  onOpenChange={(open) => {
                    if (!open) {
                      setAgentToDelete(null);
                    }
                  }}
                  open={agentToDelete?.agent_id === agent.agent_id}
                  title="Delete agent?"
                >
                  <Button
                    disabled={removeAgent.isPending}
                    icon={<Trash2 className="h-4 w-4" />}
                    onClick={() => setAgentToDelete(agent)}
                    size="icon"
                    tooltip="Delete agent"
                    type="button"
                    variant="danger"
                  />
                </ConfirmDialog>
              </div>
            </article>
          ))}
        </div>
      ) : totalCount > 0 ? (
        <EmptyState label="No active agents" />
      ) : (
        <PaxdGettingStartedGuide kind="agent" />
      )}
    </div>
  );
}

function SessionGrid({
  filteredCount,
  isLoading,
  onPageChange,
  page,
  pageCount,
  pageEnd,
  pageStart,
  sessions,
  totalCount,
}: {
  filteredCount: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
  page: number;
  pageCount: number;
  pageEnd: number;
  pageStart: number;
  sessions: SessionRow[];
  totalCount: number;
}) {
  if (isLoading) {
    return <EmptyState label="Loading sessions" />;
  }

  return (
    <div className="grid min-w-0 gap-3">
      {filteredCount > 0 && (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm text-ink-tertiary">
          <span className="min-w-0">
            Showing {pageStart}-{pageEnd} of {filteredCount}
          </span>
          <div className="flex items-center gap-2">
            <Button
              disabled={page <= 1}
              icon={<ChevronLeft className="h-4 w-4" />}
              onClick={() => onPageChange(page - 1)}
              size="icon"
              tooltip="Previous page"
              type="button"
              variant="secondary"
            />
            <span className="min-w-16 text-center text-xs text-ink-muted">
              {page}/{pageCount}
            </span>
            <Button
              disabled={page >= pageCount}
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => onPageChange(page + 1)}
              size="icon"
              tooltip="Next page"
              type="button"
              variant="secondary"
            />
          </div>
        </div>
      )}
      <div className="grid min-w-0 overflow-hidden rounded-lg border border-hairline">
        {sessions.map((session) => (
          <Link
            className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-3 transition last:border-b-0 hover:bg-surface-2 lg:grid-cols-[minmax(0,1fr)_220px_120px]"
            href={`/sessions/${session.session_id}?nodeId=${session.node_id}&agentId=${session.agent_id}`}
            key={session.session_id}
          >
            <div className="min-w-0">
              <TruncatedText className="text-sm font-medium">
                {session.name ?? session.current_task ?? session.session_id}
              </TruncatedText>
              <TruncatedText className="mt-1 text-xs text-ink-muted">
                {session.preview ?? session.current_task ?? "Open session"}
              </TruncatedText>
            </div>
            <div className="grid min-w-0 content-start gap-1">
              <div className="flex min-w-0 items-start gap-1.5">
                <Badge
                  className="min-w-0 max-w-none flex-1"
                  tone={session.agentActive ? "success" : "neutral"}
                  tooltip={session.agent_id}
                >
                  Agent: {session.agentLabel}
                </Badge>
                <Badge
                  className="min-w-0 max-w-none flex-1"
                  tone={session.nodeActive ? "success" : "neutral"}
                  tooltip={session.node_id}
                >
                  Node: {session.nodeLabel}
                </Badge>
              </div>
              <MonoId
                className="w-fit max-w-full rounded-md border border-hairline bg-canvas px-1.5 py-0.5"
                tooltip={session.session_id}
              >
                {compactId(session.session_id)}
              </MonoId>
            </div>
            <div className="flex items-start lg:justify-end">
              <Badge>{session.runtime_status ?? "unknown"}</Badge>
            </div>
          </Link>
        ))}
        {sessions.length === 0 && (
          <EmptyState
            label={totalCount > 0 ? "No active sessions" : "No sessions"}
          />
        )}
      </div>
    </div>
  );
}

function NodeRegistrationPanel({ userId }: { userId: string }) {
  const [ttl, setTtl] = useState(3600);
  const [copied, setCopied] = useState(false);
  const [createdToken, setCreatedToken] = useState<{
    expires_at?: string;
    token: string;
  } | null>(null);
  const createToken = useMutation({
    mutationFn: () => createNodeRegistrationToken(userId, ttl),
    onSuccess: (data) => {
      setCopied(false);
      setCreatedToken(data);
    },
  });

  const copyToken = async () => {
    if (!createdToken?.token || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(createdToken.token);
    setCopied(true);
  };

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="grid w-full gap-2 text-sm text-ink-muted sm:w-56">
            TTL seconds
            <input
              className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 font-mono text-base text-ink sm:text-sm"
              inputMode="numeric"
              min={300}
              onChange={(event) => setTtl(Number(event.target.value))}
              step={300}
              type="number"
              value={ttl}
            />
            <div className="flex flex-wrap gap-2">
              {[
                { label: "1h", value: 3600 },
                { label: "24h", value: 86400 },
                { label: "7d", value: 604800 },
              ].map((preset) => (
                <Button
                  aria-pressed={ttl === preset.value}
                  className="min-w-14"
                  key={preset.value}
                  onClick={() => setTtl(preset.value)}
                  size="sm"
                  type="button"
                  variant={ttl === preset.value ? "secondary" : "ghost"}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </label>
          <Button
            className="w-full sm:max-w-40"
            disabled={createToken.isPending || ttl <= 0}
            icon={<Plus className="h-4 w-4" />}
            onClick={() => createToken.mutate()}
            tooltip="Create node registration token"
            type="button"
            variant="primary"
          >
            {createToken.isPending ? "Creating..." : "Create token"}
          </Button>
        </div>
      </section>

      {createToken.error && <ApiNotice error={createToken.error} />}

      {createdToken && (
        <section className="rounded-lg border border-warning bg-surface-1 p-3">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">
                Copy this registration token now. It is one-time use.
              </div>
              <div className="mt-1 text-xs text-ink-tertiary">
                The full token is shown below and wraps inside this panel.
              </div>
            </div>
            <Button
              disabled={!createdToken.token}
              icon={
                copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )
              }
              onClick={() => void copyToken()}
              size="sm"
              tooltip={copied ? "Copied token" : "Copy token"}
              type="button"
              variant="ghost"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="mt-3 min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-hairline bg-canvas p-3 font-mono text-xs leading-6 text-ink-muted">
            {createdToken.token}
          </div>
          <div className="mt-3 font-mono text-xs text-ink-tertiary">
            expires: {createdToken.expires_at ?? "unknown"}
          </div>
        </section>
      )}
    </div>
  );
}

function E2EEKeysPanel({ agents, nodes }: { agents: Agent[]; nodes: Node[] }) {
  const [agentId, setAgentId] = useState("");
  const [encodedKey, setEncodedKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedAgentId = agents.some((agent) => agent.agent_id === agentId)
    ? agentId
    : (agents[0]?.agent_id ?? "");

  useEffect(() => {
    let active = true;
    if (!selectedAgentId) {
      return;
    }
    void loadRootKey(selectedAgentId)
      .then((key) => {
        if (active) {
          setConfigured(Boolean(key));
          setStatus("");
        }
      })
      .catch((error) => {
        if (active) {
          setStatus(error instanceof Error ? error.message : String(error));
        }
      });
    return () => {
      active = false;
    };
  }, [selectedAgentId]);

  async function handleSave() {
    setBusy(true);
    setStatus("");
    try {
      await saveRootKey(selectedAgentId, encodedKey);
      setEncodedKey("");
      setConfigured(true);
      setStatus("Root key saved in this browser.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setStatus("");
    try {
      await deleteRootKey(selectedAgentId);
      setConfigured(false);
      setEncodedKey("");
      setStatus("Root key removed from this browser.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function handleGenerate() {
    setEncodedKey(generateEncodedRootKey());
    setStatus(
      "Generated locally. Copy this key into paxd, then save it for the selected agent.",
    );
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(encodedKey);
      setStatus("Root key copied. It has not been sent to PAX Manager.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="grid min-w-0 gap-4 rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Encrypted session access</h2>
          <p className="mt-1 text-xs text-ink-tertiary">
            Pair this device to open end-to-end encrypted sessions. Encryption
            keys remain in this browser and are never sent to PAX Manager.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge tone={selectedAgentId && configured ? "success" : "neutral"}>
            {selectedAgentId && configured ? "configured" : "not configured"}
          </Badge>
          <Button asChild size="sm" variant="primary">
            <Link
              href={
                selectedAgentId
                  ? `/e2ee/pairing?agentId=${encodeURIComponent(selectedAgentId)}`
                  : "/e2ee/pairing"
              }
            >
              {configured ? "Manage paired devices" : "Pair this device"}
            </Link>
          </Button>
        </div>
      </div>
      {agents.length > 0 ? (
        <div className="grid min-w-0 gap-3 sm:max-w-md">
          <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
            Agent
            <select
              className="h-9 w-full min-w-0 rounded-md border border-hairline bg-canvas px-3 text-base text-ink outline-none focus:border-accent sm:text-sm"
              onChange={(event) => setAgentId(event.target.value)}
              value={selectedAgentId}
            >
              {agents.map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agentLabel(agent)} · {agentNodeLabel(agent, nodes)}
                </option>
              ))}
            </select>
          </label>
          <details className="min-w-0 rounded-lg border border-hairline bg-canvas p-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-muted">
              Advanced: manually manage root key
            </summary>
            <p className="mt-2 text-xs leading-5 text-warning">
              Development use only. Generating a different key from paxd will
              make encrypted sessions unreadable on this device.
            </p>
            <label className="mt-3 grid min-w-0 gap-1 text-xs text-ink-tertiary">
              Base64 root key
              <input
                autoComplete="off"
                className="h-9 w-full min-w-0 rounded-md border border-hairline bg-surface-1 px-3 font-mono text-base text-ink outline-none focus:border-accent sm:text-sm"
                onChange={(event) => setEncodedKey(event.target.value)}
                placeholder="32-byte base64 value"
                type="password"
                value={encodedKey}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                disabled={busy || !selectedAgentId}
                onClick={handleGenerate}
                type="button"
              >
                Generate development key
              </Button>
              {encodedKey && (
                <Button
                  icon={<Copy className="h-4 w-4" />}
                  onClick={() => void handleCopy()}
                  type="button"
                >
                  Copy
                </Button>
              )}
              <Button
                disabled={busy || !selectedAgentId || !encodedKey.trim()}
                onClick={() => void handleSave()}
                type="button"
              >
                Save imported key
              </Button>
              {configured && (
                <Button
                  disabled={busy}
                  onClick={() => void handleDelete()}
                  variant="danger"
                  type="button"
                >
                  Remove key from this device
                </Button>
              )}
            </div>
          </details>
        </div>
      ) : (
        <p className="text-sm text-ink-tertiary">
          Create an agent before configuring an E2EE root key.
        </p>
      )}
      {status && <p className="text-xs text-ink-tertiary">{status}</p>}
    </section>
  );
}

function agentNodeLabel(agent: Agent, nodes: Node[]) {
  const node = nodes.find((item) => item.node_id === agent.node_id);
  return node ? nodeLabel(node) : agent.node_id || "Unknown node";
}

function ApprovalsPanel({
  approvals,
  grants,
  isLoading,
  showPending,
  userId,
}: {
  approvals: AgentApproval[];
  grants: AgentApproval[];
  isLoading: boolean;
  showPending: boolean;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: ({
      approvalId,
      optionId,
    }: {
      approvalId: string;
      optionId: string;
    }) => decideApproval(userId, approvalId, optionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvalGrants(userId),
      });
    },
  });
  const revoke = useMutation({
    mutationFn: (grantId: string) => revokeApprovalGrant(userId, grantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvalGrants(userId),
      });
    },
  });

  if (isLoading) {
    return <EmptyState label="Loading approvals" />;
  }

  const pendingApprovals = approvals.filter(
    (approval) => !approval.status || approval.status === "pending",
  );
  const activeGrants = grants.filter((grant) => !grant.grant_revoked_at);

  return (
    <div
      className={`grid min-w-0 gap-5 ${
        showPending
          ? "lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]"
          : "max-w-3xl"
      }`}
    >
      {showPending && (
        <section className="grid gap-3">
          <SectionHeader
            count={pendingApprovals.length}
            title="Pending approvals"
          />
          {pendingApprovals.map((approval) => (
            <article
              className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3"
              key={approval.approval_id}
            >
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <TruncatedText className="text-base font-medium">
                    {approval.title ??
                      approval.operation ??
                      approval.approval_id}
                  </TruncatedText>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">
                    {approval.description ?? "No description provided."}
                  </p>
                </div>
                <Badge>
                  {approval.risk_level ?? approval.status ?? "pending"}
                </Badge>
              </div>
              <div className="mt-3 grid min-w-0 gap-1">
                <MonoId
                  tooltip={`${approval.domain ?? "unknown domain"} / ${
                    approval.operation ?? "unknown operation"
                  }`}
                >
                  {approval.domain ?? "unknown domain"} /{" "}
                  {approval.operation ?? "unknown operation"}
                </MonoId>
                <MonoId
                  tooltip={`${approval.resource_type ?? "resource"}: ${
                    approval.resource_ref ?? "unknown"
                  }`}
                >
                  {approval.resource_type ?? "resource"}:{" "}
                  {approval.resource_ref
                    ? compactId(approval.resource_ref)
                    : "unknown"}
                </MonoId>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {approvalOptions(approval).map((option) => (
                  <Button
                    disabled={decide.isPending}
                    key={option.option_id}
                    onClick={() =>
                      decide.mutate({
                        approvalId: approval.approval_id,
                        optionId: option.option_id,
                      })
                    }
                    size="sm"
                    tooltip={option.label}
                    type="button"
                    variant="secondary"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </article>
          ))}
          {pendingApprovals.length === 0 && (
            <EmptyState label="No pending approvals" />
          )}
        </section>
      )}

      <section className="grid content-start gap-3">
        <SectionHeader count={activeGrants.length} title="Active grants" />
        {activeGrants.map((grant) => (
          <article
            className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3"
            key={grant.approval_id}
          >
            <TruncatedText className="text-sm font-medium">
              {grant.title ?? grant.operation ?? grant.approval_id}
            </TruncatedText>
            <div className="mt-2 grid min-w-0 gap-1">
              <MonoId>{grant.decision_scope ?? "scope unknown"}</MonoId>
              <MonoId
                tooltip={
                  grant.grant_agent_id ??
                  grant.request_agent_id ??
                  "agent unknown"
                }
              >
                {compactId(
                  grant.grant_agent_id ??
                    grant.request_agent_id ??
                    "agent unknown",
                )}
              </MonoId>
            </div>
            <Button
              className="mt-3"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(grant.approval_id)}
              size="sm"
              type="button"
              variant="danger"
            >
              Revoke
            </Button>
          </article>
        ))}
        {activeGrants.length === 0 && <EmptyState label="No active grants" />}
      </section>
    </div>
  );
}

function ApiKeysPanel({
  apiKeys,
  isLoading,
  userId,
}: {
  apiKeys: {
    key_id: string;
    name?: string;
    prefix?: string;
    created_at?: string;
  }[];
  isLoading: boolean;
  userId: string;
}) {
  const [name, setName] = useState("Console key");
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const createKey = useMutation({
    mutationFn: () => createApiKey(userId, name.trim() || "Console key"),
    onSuccess: (data) => {
      setCopiedSecret(false);
      setCreatedSecret(data.key);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys(userId),
      });
    },
  });
  const deleteKey = useMutation({
    mutationFn: (keyId: string) => deleteApiKey(userId, keyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.apiKeys(userId),
      });
    },
  });

  async function copySecret() {
    if (!createdSecret || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(createdSecret);
    setCopiedSecret(true);
  }

  if (isLoading) {
    return <EmptyState label="Loading API keys" />;
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="flex min-w-0 flex-wrap items-end gap-3">
          <label className="grid flex-1 gap-2 text-sm text-ink-muted">
            Key name
            <input
              className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-base text-ink sm:text-sm"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <Button
            className="w-full min-w-36 sm:w-auto"
            disabled={createKey.isPending}
            icon={<Plus className="h-4 w-4" />}
            onClick={() => createKey.mutate()}
            tooltip="Create API key"
            type="button"
            variant="primary"
          >
            {createKey.isPending ? "Creating..." : "Create key"}
          </Button>
        </div>
        {createdSecret && (
          <div className="mt-4 rounded-lg border border-warning bg-canvas p-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink">
                  Copy this key now. It will not be shown again.
                </div>
                <div className="mt-1 text-xs text-ink-tertiary">
                  The secret stays only in this browser tab until you leave the
                  page.
                </div>
              </div>
              <Button
                icon={
                  copiedSecret ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )
                }
                onClick={() => void copySecret()}
                size="sm"
                tooltip={copiedSecret ? "Copied key" : "Copy key"}
                type="button"
                variant="ghost"
              >
                {copiedSecret ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="mt-2 max-h-32 overflow-auto break-all rounded-md border border-hairline bg-surface-1 p-2 font-mono text-xs text-ink-muted">
              {createdSecret}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <SectionHeader count={apiKeys.length} title="Existing keys" />
        <div className="grid overflow-hidden rounded-lg border border-hairline">
          {apiKeys.map((apiKey) => (
            <article
              className="flex min-w-0 items-center justify-between gap-4 border-b border-hairline bg-surface-1 px-3 py-3 last:border-b-0"
              key={apiKey.key_id}
            >
              <div className="min-w-0 flex-1">
                <TruncatedText className="text-sm font-medium">
                  {apiKey.name ?? apiKey.key_id}
                </TruncatedText>
                <MonoId className="mt-1" tooltip={apiKey.key_id}>
                  {apiKey.prefix ?? compactId(apiKey.key_id)}
                </MonoId>
              </div>
              <Button
                disabled={deleteKey.isPending}
                onClick={() => deleteKey.mutate(apiKey.key_id)}
                size="sm"
                type="button"
                variant="danger"
              >
                Revoke
              </Button>
            </article>
          ))}
        </div>
        {apiKeys.length === 0 && <EmptyState label="No API keys" />}
      </section>
    </div>
  );
}

function SectionHeader({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <TruncatedText className="text-base font-medium">{title}</TruncatedText>
      <Badge className="font-mono">{String(count)}</Badge>
    </div>
  );
}

function ActiveFilterToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-sm text-ink-muted">
      <span>Show all</span>
      <button
        aria-checked={checked}
        aria-label="Show all resources"
        className={`relative h-5 w-9 rounded-full border transition ${
          checked
            ? "border-primary bg-primary/15"
            : "border-hairline-strong bg-surface-2"
        }`}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-ink transition ${
            checked ? "left-4 bg-primary" : "left-0.5 bg-ink-tertiary"
          }`}
        />
      </button>
    </label>
  );
}

function supportsActiveFilter(kind: ResourceKind) {
  return kind === "nodes" || kind === "agents" || kind === "sessions";
}

function approvalOptions(approval: AgentApproval) {
  const options = approval.options?.filter((option) => option.option_id) ?? [];

  if (options.length > 0) {
    return options.map((option) => ({
      label: option.label ?? option.decision ?? option.option_id ?? "Decide",
      option_id: option.option_id as string,
    }));
  }

  return [
    { label: "Approve", option_id: "approve" },
    { label: "Deny", option_id: "deny" },
  ];
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface-1 p-4 text-sm text-ink-tertiary">
      {label}
    </div>
  );
}

function ApiNotice({ error }: { error: Error | null }) {
  if (!error) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-3 text-sm text-ink-muted">
      <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
      <div className="min-w-0">
        <div className="font-medium text-ink">API request failed</div>
        <TruncatedText className="mt-1 font-mono text-xs text-ink-tertiary">
          {error.name}: {error.message}
        </TruncatedText>
      </div>
    </div>
  );
}

function firstQueryError(queries: Array<{ error: Error | null }>) {
  return queries.find((query) => query.error)?.error ?? null;
}

function agentCardSummary(agent: Agent) {
  const tags = [
    ...stringArray(agent.card?.routing_tags),
    ...stringArray(agent.card?.skills),
    ...stringArray(agent.card?.specialties),
  ];

  return tags.length > 0 ? tags.slice(0, 4).join(" / ") : "No profile card";
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
