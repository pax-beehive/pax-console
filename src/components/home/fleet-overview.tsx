"use client";

import Link from "next/link";
import { useQueries } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  Server,
  ShieldCheck,
  TerminalSquare,
  Users,
} from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { TruncatedText } from "@/components/ui/text";
import {
  listNodeAgents,
  useAgentSessions,
  useNodes,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import { Agent, Node, User } from "@/features/api/types";
import { compactId } from "@/lib/format";

type FleetOverviewProps = {
  user: User;
};

export function FleetOverview({ user }: FleetOverviewProps) {
  // Overview loads progressively: user -> nodes -> all node agents -> active
  // agent sessions. For now "active" means the first available item; the
  // Zustand store is already in place for explicit selection once the UI needs it.
  const nodesQuery = useNodes(user.user_id);
  const nodes = sortOnlineFirst(
    nodesQuery.data?.nodes ?? [],
    (node) => node.online,
    (node) => node.name ?? node.hostname ?? node.node_id,
  );
  const agentQueries = useQueries({
    queries: nodes.map((node) => ({
      queryKey: queryKeys.agents(user.user_id, node.node_id),
      queryFn: () => listNodeAgents(user.user_id, node.node_id),
      enabled: Boolean(user.user_id && node.node_id),
    })),
  });
  const agents = sortOnlineFirst(
    agentQueries.flatMap((query) => query.data?.agents ?? []),
    (agent) => agent.online,
    (agent) => agent.name ?? agent.agent_type ?? agent.agent_id,
  );
  const activeAgent = agents[0];
  const activeNode =
    nodes.find((node) => node.node_id === activeAgent?.node_id) ?? nodes[0];
  const agentsLoading =
    nodesQuery.isLoading || agentQueries.some((query) => query.isLoading);
  const sessionsQuery = useAgentSessions(
    user.user_id,
    activeNode?.node_id,
    activeAgent?.agent_id,
  );
  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <ConsoleLayout
      activeAgent={activeAgent}
      activeNode={activeNode}
      nodes={nodes}
      user={user}
    >
      <div className="grid gap-0">
        <section className="border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-ink-tertiary">Fleet</div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal">
                Workbench
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-subtle">
                A compact entry point for runtime work, collaboration, and
                human review.
              </p>
            </div>

            <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:w-[520px]">
              <MetricCard
                icon={<Server className="h-4 w-4" />}
                label="Nodes"
                value={loadingValue(nodesQuery.isLoading, nodes.length)}
                sub={`${nodes.filter((node) => node.online).length} online`}
              />
              <MetricCard
                icon={<Bot className="h-4 w-4" />}
                label="Agents"
                value={loadingValue(agentsLoading, agents.length)}
                sub={`${nodes.length} nodes scanned`}
              />
              <MetricCard
                icon={<TerminalSquare className="h-4 w-4" />}
                label="Sessions"
                value={loadingValue(sessionsQuery.isLoading, sessions.length)}
                sub={activeAgent?.agent_id ?? "No agent selected"}
              />
            </div>
          </div>
        </section>

        <ApiState
          error={
            nodesQuery.error ??
            firstQueryError(agentQueries) ??
            sessionsQuery.error ??
            null
          }
        />

        <div className="grid min-w-0 gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="grid content-start gap-3">
            <div className="text-sm font-medium text-ink">Workspaces</div>
            <div className="grid overflow-hidden rounded-lg border border-hairline">
              <WorkspaceLink
                description="Nodes, agents, sessions, approvals, and health in one operational workspace."
                href="/nodes"
                icon={<Server className="h-4 w-4" />}
                label="Runtime"
              />
              <WorkspaceLink
                description="Jump directly into recent agent sessions and continue work."
                href="/sessions"
                icon={<TerminalSquare className="h-4 w-4" />}
                label="Sessions"
              />
              <WorkspaceLink
                description="Teams, friends, envelopes, and reusable knowledge handoff."
                href="/teams?view=teams"
                icon={<Users className="h-4 w-4" />}
                label="Collaboration"
              />
              <WorkspaceLink
                description="Review pending human decisions and approval grants."
                href="/approvals"
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Approvals"
              />
            </div>
          </section>

          <aside className="grid content-start gap-3">
            <div className="text-sm font-medium text-ink">Current context</div>
            <div className="grid rounded-lg border border-hairline bg-surface-1 p-3">
              <ContextLine
                label="Node"
                value={activeNode?.name ?? activeNode?.hostname ?? "No node"}
              />
              <ContextLine
                label="Agent"
                value={
                  activeAgent?.name ??
                  activeAgent?.agent_type ??
                  "No agent selected"
                }
              />
              <ContextLine
                label="Recent sessions"
                value={loadingValue(sessionsQuery.isLoading, sessions.length)}
              />
            </div>
          </aside>
        </div>
      </div>
    </ConsoleLayout>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-surface-1 px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-ink-tertiary">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-mono text-xl text-ink">{value}</div>
      <TruncatedText className="mt-1 text-xs text-ink-subtle" tooltip={sub}>
        {sub.startsWith("node_") || sub.startsWith("agent_") ? compactId(sub) : sub}
      </TruncatedText>
    </div>
  );
}

function WorkspaceLink({
  description,
  href,
  icon,
  label,
}: {
  description: string;
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      className="grid min-w-0 gap-1 border-b border-hairline bg-surface-1 px-3 py-3 transition last:border-b-0 hover:bg-surface-2"
      href={href}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        {icon}
        {label}
      </div>
      <TruncatedText className="text-xs text-ink-tertiary">
        {description}
      </TruncatedText>
    </Link>
  );
}

function ContextLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-hairline py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <TruncatedText className="mt-1 text-sm text-ink-muted" tooltip={value}>
        {value}
      </TruncatedText>
    </div>
  );
}

function ApiState({ error }: { error: Error | null }) {
  if (!error) {
    return null;
  }

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

function loadingValue(isLoading: boolean, value: number) {
  return isLoading ? "..." : String(value);
}

function firstQueryError(queries: Array<{ error: Error | null }>) {
  return queries.find((query) => query.error)?.error ?? null;
}

function sortOnlineFirst<T extends Agent | Node>(
  items: T[],
  isOnline: (item: T) => boolean | undefined,
  label: (item: T) => string,
) {
  return [...items].sort((a, b) => {
    const onlineDiff = Number(Boolean(isOnline(b))) - Number(Boolean(isOnline(a)));
    if (onlineDiff !== 0) {
      return onlineDiff;
    }

    return label(a).localeCompare(label(b));
  });
}
