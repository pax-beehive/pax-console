"use client";

import Link from "next/link";
import { ReactNode, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  KeyRound,
  Plus,
  Radio,
  Server,
  Settings2,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  createApiKey,
  createNodeRegistrationToken,
  decideApproval,
  deleteApiKey,
  revokeApprovalGrant,
  useAgentSessions,
  useApiKeys,
  useApprovalGrants,
  useApprovals,
  useHealth,
  useNodeAgents,
  useNodes,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import { Agent, AgentApproval, AgentSession, Node, User } from "@/features/api/types";

type ResourceKind =
  | "nodes"
  | "agents"
  | "sessions"
  | "approvals"
  | "monitor"
  | "api-keys"
  | "node-registration";

type ResourcePageClientProps = {
  kind: ResourceKind;
  user: User;
};

const copy: Record<ResourceKind, { title: string; eyebrow: string; icon: ReactNode }> = {
  nodes: {
    title: "Nodes",
    eyebrow: "paxd fleet",
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
  monitor: {
    title: "Monitor",
    eyebrow: "live health",
    icon: <Radio className="h-4 w-4" />,
  },
  "api-keys": {
    title: "API Keys",
    eyebrow: "access management",
    icon: <KeyRound className="h-4 w-4" />,
  },
  "node-registration": {
    title: "Node Registration",
    eyebrow: "bootstrap access",
    icon: <Settings2 className="h-4 w-4" />,
  },
};

export function ResourcePageClient({ kind, user }: ResourcePageClientProps) {
  const nodesQuery = useNodes(user.user_id);
  const nodes = nodesQuery.data?.nodes ?? [];
  const activeNode = nodes[0];
  const agentsQuery = useNodeAgents(user.user_id, activeNode?.node_id);
  const agents = agentsQuery.data?.agents ?? [];
  const activeAgent = agents[0];
  const sessionsQuery = useAgentSessions(
    user.user_id,
    activeNode?.node_id,
    activeAgent?.agent_id,
  );
  const sessions = sessionsQuery.data?.sessions ?? [];
  const healthQuery = useHealth(kind === "monitor");
  const apiKeysQuery = useApiKeys(kind === "api-keys" ? user.user_id : undefined);
  const approvalsQuery = useApprovals(
    kind === "approvals" ? user.user_id : undefined,
  );
  const approvalGrantsQuery = useApprovalGrants(
    kind === "approvals" ? user.user_id : undefined,
  );
  const meta = copy[kind];

  return (
    <ConsoleLayout
      activeAgent={activeAgent}
      activeNode={activeNode}
      nodes={nodes}
      user={user}
    >
      <div className="grid gap-4 p-5">
        <header className="flex items-center justify-between border-b border-hairline pb-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-ink-tertiary">
              {meta.icon}
              {meta.eyebrow}
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{meta.title}</h1>
          </div>
        </header>

        <ApiNotice
          error={
            nodesQuery.error ??
            agentsQuery.error ??
            sessionsQuery.error ??
            healthQuery.error ??
            apiKeysQuery.error ??
            approvalsQuery.error ??
            approvalGrantsQuery.error ??
            null
          }
        />

        {kind === "nodes" && <NodeGrid isLoading={nodesQuery.isLoading} nodes={nodes} />}
        {kind === "agents" && (
          <AgentGrid
            agents={agents}
            isLoading={agentsQuery.isLoading}
            nodeLabel={activeNode?.name ?? activeNode?.hostname ?? activeNode?.node_id}
          />
        )}
        {kind === "sessions" && (
          <SessionGrid isLoading={sessionsQuery.isLoading} sessions={sessions} />
        )}
        {kind === "approvals" && (
          <ApprovalsPanel
            approvals={approvalsQuery.data?.approvals ?? []}
            grants={approvalGrantsQuery.data?.grants ?? []}
            isLoading={approvalsQuery.isLoading || approvalGrantsQuery.isLoading}
            userId={user.user_id}
          />
        )}
        {kind === "monitor" && (
          <MonitorPanel
            agents={agents}
            health={healthQuery.data}
            isHealthLoading={healthQuery.isLoading}
            nodes={nodes}
            sessions={sessions}
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
    </ConsoleLayout>
  );
}

function NodeGrid({
  isLoading,
  nodes,
}: {
  isLoading: boolean;
  nodes: Node[];
}) {
  if (isLoading) {
    return <EmptyState label="Loading nodes" />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 md:grid-cols-2">
      {nodes.map((node) => (
        <Link
          className="min-w-0 rounded-xl border border-hairline bg-surface-1 p-4 transition hover:border-hairline-strong hover:bg-surface-2"
          href={`/nodes/${node.node_id}`}
          key={node.node_id}
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <TruncatedText className="text-base font-medium">
              {node.name ?? node.hostname ?? node.node_id}
            </TruncatedText>
            <span className="rounded-full border border-hairline px-2 py-0.5 text-xs text-ink-subtle">
              {node.online ? "online" : "offline"}
            </span>
          </div>
          <div className="mt-3 grid min-w-0 gap-1">
            <MonoId>{node.os ?? "unknown os"} / {node.arch ?? "unknown arch"}</MonoId>
            <MonoId>{node.node_id}</MonoId>
          </div>
        </Link>
      ))}
      {nodes.length === 0 && <EmptyState label="No nodes" />}
    </div>
  );
}

function AgentGrid({
  agents,
  isLoading,
  nodeLabel,
}: {
  agents: Agent[];
  isLoading: boolean;
  nodeLabel?: string;
}) {
  if (isLoading) {
    return <EmptyState label="Loading agents" />;
  }

  return (
    <div className="grid gap-3">
      <div className="flex min-w-0 text-sm text-ink-tertiary">
        <span className="shrink-0">Active node:&nbsp;</span>
        <TruncatedText>{nodeLabel ?? "No node selected"}</TruncatedText>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 md:grid-cols-2">
        {agents.map((agent) => (
          <Link
            className="min-w-0 rounded-xl border border-hairline bg-surface-1 p-4 transition hover:border-hairline-strong hover:bg-surface-2"
            href={`/agents/${agent.agent_id}?nodeId=${agent.node_id}`}
            key={agent.agent_id}
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <TruncatedText className="text-base font-medium">
                {agent.name ?? agent.agent_type ?? agent.agent_id}
              </TruncatedText>
              <span className="rounded-full border border-hairline px-2 py-0.5 text-xs text-ink-subtle">
                {agent.status ?? "unknown"}
              </span>
            </div>
            <MonoId className="mt-3">{agent.agent_id}</MonoId>
          </Link>
        ))}
        {agents.length === 0 && <EmptyState label="No agents on active node" />}
      </div>
    </div>
  );
}

function SessionGrid({
  isLoading,
  sessions,
}: {
  isLoading: boolean;
  sessions: AgentSession[];
}) {
  if (isLoading) {
    return <EmptyState label="Loading sessions" />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {sessions.map((session) => (
        <Link
          className="min-w-0 rounded-xl border border-hairline bg-surface-1 p-4 transition hover:border-hairline-strong hover:bg-surface-2"
          href={`/sessions/${session.session_id}?nodeId=${session.node_id}&agentId=${session.agent_id}`}
          key={session.session_id}
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <TruncatedText className="text-base font-medium">
              {session.name ?? session.current_task ?? session.session_id}
            </TruncatedText>
            <span className="rounded-full border border-hairline px-2 py-0.5 text-xs text-ink-subtle">
              {session.run_status ?? session.status ?? "unknown"}
            </span>
          </div>
          <TruncatedText className="mt-2 text-sm text-ink-muted">
            {session.preview ?? session.current_task ?? "Open session"}
          </TruncatedText>
          <MonoId className="mt-3">{session.session_id}</MonoId>
        </Link>
      ))}
      {sessions.length === 0 && <EmptyState label="No sessions on active agent" />}
    </div>
  );
}

function MonitorPanel({
  agents,
  health,
  isHealthLoading,
  nodes,
  sessions,
}: {
  agents: Agent[];
  health?: { status?: string };
  isHealthLoading: boolean;
  nodes: Node[];
  sessions: AgentSession[];
}) {
  const onlineNodes = nodes.filter((node) => node.online).length;
  const activeAgents = agents.filter((agent) => agent.online || agent.status === "online").length;

  return (
    <div className="grid grid-cols-4 gap-4">
      <Metric
        label="PAX Manager"
        value={isHealthLoading ? "..." : health?.status ?? "unknown"}
      />
      <Metric label="Online nodes" value={`${onlineNodes}/${nodes.length}`} />
      <Metric label="Active agents" value={`${activeAgents}/${agents.length}`} />
      <Metric label="Recent sessions" value={String(sessions.length)} />
    </div>
  );
}

function NodeRegistrationPanel({ userId }: { userId: string }) {
  const [ttl, setTtl] = useState(3600);
  const [createdToken, setCreatedToken] = useState<{
    expires_at?: string;
    token: string;
  } | null>(null);
  const createToken = useMutation({
    mutationFn: () => createNodeRegistrationToken(userId, ttl),
    onSuccess: (data) => setCreatedToken(data),
  });

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-hairline bg-surface-1 p-4">
        <div className="flex items-end gap-3">
          <label className="grid w-56 gap-2 text-sm text-ink-muted">
            TTL seconds
            <input
              className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 font-mono text-sm text-ink"
              min={300}
              onChange={(event) => setTtl(Number(event.target.value))}
              step={300}
              type="number"
              value={ttl}
            />
          </label>
          <Button
            className="max-w-40"
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

      {createToken.error && (
        <ApiNotice error={createToken.error} />
      )}

      {createdToken && (
        <section className="rounded-xl border border-warning bg-surface-1 p-4">
          <div className="text-sm font-medium text-ink">
            Copy this registration token now. It is one-time use.
          </div>
          <div className="mt-3 break-all font-mono text-xs leading-6 text-ink-muted">
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

function ApprovalsPanel({
  approvals,
  grants,
  isLoading,
  userId,
}: {
  approvals: AgentApproval[];
  grants: AgentApproval[];
  isLoading: boolean;
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals(userId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvalGrants(userId),
      });
    },
  });
  const revoke = useMutation({
    mutationFn: (grantId: string) => revokeApprovalGrant(userId, grantId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals(userId) });
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
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)] gap-4">
      <section className="grid gap-3">
        <SectionHeader
          count={pendingApprovals.length}
          title="Pending approvals"
        />
        {pendingApprovals.map((approval) => (
          <article
            className="rounded-xl border border-hairline bg-surface-1 p-4"
            key={approval.approval_id}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <TruncatedText className="text-base font-medium">
                  {approval.title ?? approval.operation ?? approval.approval_id}
                </TruncatedText>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {approval.description ?? "No description provided."}
                </p>
              </div>
              <span className="rounded-full border border-hairline px-2 py-0.5 text-xs text-ink-subtle">
                {approval.risk_level ?? approval.status ?? "pending"}
              </span>
            </div>
            <div className="mt-3 grid min-w-0 gap-1">
              <MonoId>{approval.domain ?? "unknown domain"} / {approval.operation ?? "unknown operation"}</MonoId>
              <MonoId>{approval.resource_type ?? "resource"}: {approval.resource_ref ?? "unknown"}</MonoId>
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

      <section className="grid content-start gap-3">
        <SectionHeader count={activeGrants.length} title="Active grants" />
        {activeGrants.map((grant) => (
          <article
            className="rounded-xl border border-hairline bg-surface-1 p-4"
            key={grant.approval_id}
          >
            <TruncatedText className="text-sm font-medium">
              {grant.title ?? grant.operation ?? grant.approval_id}
            </TruncatedText>
            <div className="mt-2 grid min-w-0 gap-1">
              <MonoId>{grant.decision_scope ?? "scope unknown"}</MonoId>
              <MonoId>{grant.grant_agent_id ?? grant.request_agent_id ?? "agent unknown"}</MonoId>
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
  apiKeys: { key_id: string; name?: string; prefix?: string; created_at?: string }[];
  isLoading: boolean;
  userId: string;
}) {
  const [name, setName] = useState("Console key");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const createKey = useMutation({
    mutationFn: () => createApiKey(userId, name.trim() || "Console key"),
    onSuccess: (data) => {
      setCreatedSecret(data.key);
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(userId) });
    },
  });
  const deleteKey = useMutation({
    mutationFn: (keyId: string) => deleteApiKey(userId, keyId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(userId) });
    },
  });

  if (isLoading) {
    return <EmptyState label="Loading API keys" />;
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-hairline bg-surface-1 p-4">
        <div className="flex items-end gap-3">
          <label className="grid flex-1 gap-2 text-sm text-ink-muted">
            Key name
            <input
              className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink"
              onChange={(event) => setName(event.target.value)}
              value={name}
            />
          </label>
          <Button
            className="max-w-32"
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
            <div className="text-sm font-medium text-ink">
              Copy this key now. It will not be shown again.
            </div>
            <div className="mt-2 break-all font-mono text-xs text-ink-muted">
              {createdSecret}
            </div>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <SectionHeader count={apiKeys.length} title="Existing keys" />
        {apiKeys.map((apiKey) => (
          <article
            className="flex items-center justify-between gap-4 rounded-xl border border-hairline bg-surface-1 p-4"
            key={apiKey.key_id}
          >
            <div className="min-w-0 flex-1">
              <TruncatedText className="text-sm font-medium">
                {apiKey.name ?? apiKey.key_id}
              </TruncatedText>
              <MonoId className="mt-1">
                {apiKey.prefix ?? apiKey.key_id}
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
        {apiKeys.length === 0 && <EmptyState label="No API keys" />}
      </section>
    </div>
  );
}

function SectionHeader({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-medium">{title}</h2>
      <span className="rounded-full border border-hairline px-2 py-0.5 font-mono text-xs text-ink-subtle">
        {count}
      </span>
    </div>
  );
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-5">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <div className="mt-2 font-mono text-3xl text-ink">{value}</div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-hairline bg-surface-1 p-5 text-sm text-ink-tertiary">
      {label}
    </div>
  );
}

function ApiNotice({ error }: { error: Error | null }) {
  if (!error) {
    return null;
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-hairline bg-surface-1 p-4 text-sm text-ink-muted">
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
