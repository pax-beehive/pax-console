"use client";

import Link from "next/link";
import { AlertCircle, Bot, CircleDot, Server, TerminalSquare } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  useAgentSessions,
  useNodeAgents,
  useNodes,
} from "@/features/api/resources";
import { User } from "@/features/api/types";

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
      <div className="grid gap-4 p-5">
        <section className="grid grid-cols-[minmax(0,1.3fr)_minmax(320px,0.9fr)] gap-5 rounded-xl border border-hairline bg-surface-1 p-6">
          <div>
            <div className="text-sm font-medium text-ink-subtle">
              Fleet control plane
            </div>
            <h1 className="mt-3 max-w-3xl text-[40px] font-semibold leading-tight">
              Observe, steer, and resume agent work across your nodes.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-ink-muted">
              This screen is now backed by the PAX Manager API. It starts with
              Cloudflare Access, then loads nodes, agents, sessions, and live
              tunnel status.
            </p>
          </div>

          <div className="grid gap-3">
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
        </section>

        <ApiState
          error={
            nodesQuery.error ?? agentsQuery.error ?? sessionsQuery.error ?? null
          }
        />

        <div className="grid grid-cols-3 gap-4">
          <section className="rounded-xl border border-hairline bg-surface-1 p-5">
            <SectionTitle title="Nodes" />
            <div className="mt-4 grid gap-2">
              {nodes.map((node) => (
                <div
                  className="rounded-lg border border-hairline bg-canvas p-3"
                  key={node.node_id}
                >
                  <div className="flex items-center justify-between gap-3">
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

          <section className="rounded-xl border border-hairline bg-surface-1 p-5">
            <SectionTitle title="Agents" />
            <div className="mt-4 grid gap-2">
              {agents.map((agent) => (
                <div
                  className="rounded-lg border border-hairline bg-canvas p-3"
                  key={agent.agent_id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <TruncatedText className="text-sm font-medium">
                      {agent.name ?? agent.agent_type ?? agent.agent_id}
                    </TruncatedText>
                    <span className="rounded-full border border-hairline bg-surface-1 px-2 py-0.5 text-xs text-ink-subtle">
                      {agent.status ?? "unknown"}
                    </span>
                  </div>
                  <MonoId className="mt-1">
                    {agent.agent_id}
                  </MonoId>
                </div>
              ))}
              {!agentsQuery.isLoading && agents.length === 0 && (
                <Empty label="No agents on active node" />
              )}
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-surface-1 p-5">
            <SectionTitle title="Recent sessions" />
            <div className="mt-4 grid gap-2">
              {sessions.map((session) => (
                <Link
                  className="rounded-lg border border-hairline bg-canvas p-3 transition hover:border-hairline-strong hover:bg-surface-2"
                  href={`/sessions/${session.session_id}?nodeId=${session.node_id}&agentId=${session.agent_id}`}
                  key={session.session_id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <TruncatedText className="text-sm font-medium">
                      {session.name ?? session.current_task ?? session.session_id}
                    </TruncatedText>
                    <span className="rounded-full border border-hairline bg-surface-1 px-2 py-0.5 text-xs text-ink-subtle">
                      {session.run_status ?? session.status ?? "unknown"}
                    </span>
                  </div>
                  <TruncatedText className="mt-1 text-xs text-ink-tertiary">
                    {session.preview ?? session.current_task ?? "Open session"}
                  </TruncatedText>
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
    <div className="rounded-xl border border-hairline bg-canvas p-4">
      <div className="flex items-center gap-2 text-xs text-ink-tertiary">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl text-ink">{value}</div>
      <TruncatedText className="mt-1 text-xs text-ink-subtle">{sub}</TruncatedText>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-base font-medium">{title}</h2>;
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-canvas p-3 text-sm text-ink-tertiary">
      {label}
    </div>
  );
}

function ApiState({ error }: { error: Error | null }) {
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

function loadingValue(isLoading: boolean, value: number) {
  return isLoading ? "..." : String(value);
}
