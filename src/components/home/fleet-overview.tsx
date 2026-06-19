"use client";

import Link from "next/link";
import { AlertCircle, Bot, CircleDot, Server, TerminalSquare } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  useAgentSessions,
  useNodeAgents,
  useNodes,
} from "@/features/api/resources";
import { User } from "@/features/api/types";
import { compactId } from "@/lib/format";

type FleetOverviewProps = {
  user: User;
};

export function FleetOverview({ user }: FleetOverviewProps) {
  // Overview loads progressively: user -> nodes -> active node agents -> active
  // agent sessions. For now "active" means the first available item; the
  // Zustand store is already in place for explicit selection once the UI needs it.
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
                PAX Manager data, live tunnel readiness, and recent agent
                sessions in one place.
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
              label="Agents on active node"
              value={loadingValue(agentsQuery.isLoading, agents.length)}
              sub={activeNode?.node_id ?? "No node selected"}
            />
            <MetricCard
              icon={<TerminalSquare className="h-4 w-4" />}
              label="Sessions on active agent"
              value={loadingValue(sessionsQuery.isLoading, sessions.length)}
              sub={activeAgent?.agent_id ?? "No agent selected"}
            />
            </div>
          </div>
        </section>

        <ApiState
          error={
            nodesQuery.error ?? agentsQuery.error ?? sessionsQuery.error ?? null
          }
        />

        <div className="grid min-w-0 grid-cols-1 lg:grid-cols-3">
          <section className="min-w-0 border-b border-hairline p-5 lg:border-b-0 lg:border-r">
            <SectionTitle title="Nodes" />
            <div className="mt-3 grid gap-0 overflow-hidden rounded-lg border border-hairline">
              {nodes.map((node) => (
                <div
                  className="min-w-0 border-b border-hairline bg-surface-1 px-3 py-2.5 last:border-b-0"
                  key={node.node_id}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <TruncatedText className="text-sm font-medium">
                      {node.name ?? node.hostname ?? node.node_id}
                    </TruncatedText>
                    <CircleDot
                      className={`h-3 w-3 ${
                        node.online ? "text-success" : "text-ink-tertiary"
                      }`}
                    />
                  </div>
                  <MonoId className="mt-1">
                    {node.os ?? "unknown os"} / {node.arch ?? "unknown arch"}
                  </MonoId>
                </div>
              ))}
              {!nodesQuery.isLoading && nodes.length === 0 && <Empty label="No nodes" />}
            </div>
          </section>

          <section className="min-w-0 border-b border-hairline p-5 lg:border-b-0 lg:border-r">
            <SectionTitle title="Agents" />
            <div className="mt-3 grid gap-0 overflow-hidden rounded-lg border border-hairline">
              {agents.map((agent) => (
                <div
                  className="min-w-0 border-b border-hairline bg-surface-1 px-3 py-2.5 last:border-b-0"
                  key={agent.agent_id}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <TruncatedText className="text-sm font-medium">
                      {agent.name ?? agent.agent_type ?? agent.agent_id}
                    </TruncatedText>
                    <Badge>{agent.status ?? "unknown"}</Badge>
                  </div>
                  <MonoId className="mt-1" tooltip={agent.agent_id}>
                    {compactId(agent.agent_id)}
                  </MonoId>
                </div>
              ))}
              {!agentsQuery.isLoading && agents.length === 0 && (
                <Empty label="No agents on active node" />
              )}
            </div>
          </section>

          <section className="min-w-0 p-5">
            <SectionTitle title="Recent sessions" />
            <div className="mt-3 grid gap-0 overflow-hidden rounded-lg border border-hairline">
              {sessions.map((session) => (
                <Link
                  className="block min-w-0 border-b border-hairline bg-surface-1 px-3 py-2.5 transition last:border-b-0 hover:bg-surface-2"
                  href={`/sessions/${session.session_id}?nodeId=${session.node_id}&agentId=${session.agent_id}`}
                  key={session.session_id}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <TruncatedText className="text-sm font-medium">
                      {session.name ?? session.current_task ?? session.session_id}
                    </TruncatedText>
                    <Badge>{session.run_status ?? session.status ?? "unknown"}</Badge>
                  </div>
                  <TruncatedText className="mt-1 text-xs text-ink-tertiary">
                    {session.preview ?? session.current_task ?? "Open session"}
                  </TruncatedText>
                  <MonoId className="mt-1" tooltip={session.session_id}>
                    {compactId(session.session_id)}
                  </MonoId>
                </Link>
              ))}
              {!sessionsQuery.isLoading && sessions.length === 0 && (
                <Empty label="No sessions on active agent" />
              )}
            </div>
          </section>
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

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-base font-medium">{title}</h2>;
}

function Empty({ label }: { label: string }) {
  return (
    <div className="bg-surface-1 px-3 py-2.5 text-sm text-ink-tertiary">
      {label}
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
