"use client";

import Link from "next/link";
import { AlertCircle, ArrowLeft, Bot, Server } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  useAgentSessions,
  useNode,
  useNodeAgent,
  useNodeAgents,
  useNodes,
} from "@/features/api/resources";
import { Agent, Node, User } from "@/features/api/types";
import { compactId } from "@/lib/format";

type NodeDetailPageClientProps = {
  nodeId: string;
  user: User;
};

type AgentDetailPageClientProps = {
  agentId: string;
  nodeId?: string;
  user: User;
};

export function NodeDetailPageClient({
  nodeId,
  user,
}: NodeDetailPageClientProps) {
  const nodesQuery = useNodes(user.user_id);
  const nodeQuery = useNode(user.user_id, nodeId);
  const agentsQuery = useNodeAgents(user.user_id, nodeId);
  const nodes = nodesQuery.data?.nodes ?? [];
  const node = nodeQuery.data;
  const agents = agentsQuery.data?.agents ?? [];

  return (
    <ConsoleLayout activeNode={node} nodes={nodes} user={user}>
      <DetailShell
        backHref="/nodes"
        error={nodeQuery.error ?? agentsQuery.error}
        eyebrow="node detail"
        icon={<Server className="h-4 w-4" />}
        title={node?.name ?? node?.hostname ?? nodeId}
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <DetailCard
            rows={[
              ["Node ID", node?.node_id ?? nodeId],
              ["Status", nodeStatus(node)],
              ["Host", node?.hostname ?? "unknown"],
              ["OS", `${node?.os ?? "unknown"} / ${node?.arch ?? "unknown"}`],
              ["Machine", node?.machine_type ?? "unknown"],
              ["paxd", node?.paxd_version ?? "unknown"],
              ["API endpoint", node?.api_endpoint ?? "unknown"],
              ["Last heartbeat", node?.last_heartbeat ?? "unknown"],
              ["Registered", node?.registered_at ?? "unknown"],
            ]}
            title="Profile"
          />
          <JsonCard title="Metadata" value={node?.metadata} />
        </div>

        <section className="grid gap-3">
          <SectionHeader count={agents.length} title="Agents on this node" />
          <div className="grid min-w-0 overflow-hidden rounded-lg border border-hairline">
            {agents.map((agent) => (
              <Link
                className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 transition last:border-b-0 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_180px_120px]"
                href={`/agents/${agent.agent_id}?nodeId=${nodeId}`}
                key={agent.agent_id}
              >
                <div className="min-w-0">
                  <TruncatedText className="text-base font-medium">
                    {agent.name ?? agent.agent_type ?? agent.agent_id}
                  </TruncatedText>
                </div>
                <MonoId tooltip={agent.agent_id}>
                  {compactId(agent.agent_id)}
                </MonoId>
                <div className="flex items-start sm:justify-end">
                  <Badge>{agent.status ?? "unknown"}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </DetailShell>
    </ConsoleLayout>
  );
}

export function AgentDetailPageClient({
  agentId,
  nodeId,
  user,
}: AgentDetailPageClientProps) {
  const nodesQuery = useNodes(user.user_id);
  const nodes = nodesQuery.data?.nodes ?? [];
  const activeNodeId = nodeId ?? nodes[0]?.node_id;
  const node = nodes.find((candidate) => candidate.node_id === activeNodeId);
  const agentQuery = useNodeAgent(user.user_id, activeNodeId, agentId);
  const agent = agentQuery.data;
  const sessionsQuery = useAgentSessions(user.user_id, activeNodeId, agentId);
  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <ConsoleLayout activeAgent={agent} activeNode={node} nodes={nodes} user={user}>
      <DetailShell
        backHref="/agents"
        error={agentQuery.error ?? sessionsQuery.error}
        eyebrow="agent detail"
        icon={<Bot className="h-4 w-4" />}
        title={agent?.name ?? agent?.agent_type ?? agentId}
      >
        {!activeNodeId && (
          <Notice message="No nodeId is available for this agent. Open an agent from a node or the agents list." />
        )}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <DetailCard
            rows={[
              ["Agent ID", agent?.agent_id ?? agentId],
              ["Node ID", agent?.node_id ?? activeNodeId ?? "unknown"],
              ["Type", agent?.agent_type ?? "unknown"],
              ["Status", agentStatus(agent)],
              ["Last heartbeat", agent?.last_heartbeat ?? "unknown"],
              ["Registered", agent?.registered_at ?? "unknown"],
            ]}
            title="Profile"
          />
          <JsonCard title="Capabilities" value={agent?.capabilities} />
        </div>

        <section className="grid gap-3">
          <SectionHeader count={sessions.length} title="Recent sessions" />
          <div className="grid min-w-0 overflow-hidden rounded-lg border border-hairline">
            {sessions.map((session) => (
              <Link
                className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 transition last:border-b-0 hover:bg-surface-2 lg:grid-cols-[minmax(0,1fr)_120px]"
                href={`/sessions/${session.session_id}?nodeId=${session.node_id}&agentId=${session.agent_id}`}
                key={session.session_id}
              >
                <div className="min-w-0">
                  <TruncatedText className="text-base font-medium">
                    {session.name ?? session.current_task ?? session.session_id}
                  </TruncatedText>
                  <TruncatedText className="mt-1 text-sm text-ink-muted">
                    {session.preview ?? session.current_task ?? "Open session"}
                  </TruncatedText>
                </div>
                <div className="flex items-start lg:justify-end">
                  <Badge>{session.run_status ?? session.status ?? "unknown"}</Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </DetailShell>
    </ConsoleLayout>
  );
}

function DetailShell({
  backHref,
  children,
  error,
  eyebrow,
  icon,
  title,
}: {
  backHref: string;
  children: React.ReactNode;
  error: Error | null;
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="grid gap-5 p-5">
      <header className="flex items-center justify-between border-b border-hairline pb-4">
        <div className="min-w-0">
          <Link
            className="inline-flex items-center gap-2 text-sm text-ink-subtle hover:text-ink"
            href={backHref}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-tertiary">
            {icon}
            {eyebrow}
          </div>
          <TruncatedText className="mt-2 max-w-[60vw] text-2xl font-semibold">
            {title}
          </TruncatedText>
        </div>
      </header>
      {error && <Notice message={`${error.name}: ${error.message}`} />}
      {children}
    </div>
  );
}

function DetailCard({ rows, title }: { rows: string[][]; title: string }) {
  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
      <h2 className="text-base font-medium">{title}</h2>
      <div className="mt-3 grid overflow-hidden rounded-md border border-hairline">
        {rows.map(([label, value]) => (
          <div className="grid min-w-0 grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-hairline px-3 py-2 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]" key={label}>
            <TruncatedText className="text-xs text-ink-tertiary">{label}</TruncatedText>
            <MonoId className="text-ink-muted" tooltip={value}>
              {value.startsWith("node_") || value.startsWith("agent_") || value.startsWith("sess_")
                ? compactId(value)
                : value}
            </MonoId>
          </div>
        ))}
      </div>
    </section>
  );
}

function JsonCard({ title, value }: { title: string; value?: unknown }) {
  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
      <h2 className="text-base font-medium">{title}</h2>
      <pre className="mt-3 max-h-80 max-w-full overflow-auto rounded-md border border-hairline bg-canvas p-3 text-xs leading-6 text-ink-muted">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </section>
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

function Notice({ message }: { message: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-3 text-sm text-ink-muted">
      <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
      <div className="min-w-0">
        <div className="font-medium text-ink">Detail request notice</div>
        <TruncatedText className="mt-1 font-mono text-xs text-ink-tertiary">
          {message}
        </TruncatedText>
      </div>
    </div>
  );
}

function nodeStatus(node?: Node) {
  return node?.status ?? (node?.online ? "online" : "offline");
}

function agentStatus(agent?: Agent) {
  return agent?.status ?? (agent?.online ? "online" : "offline");
}
