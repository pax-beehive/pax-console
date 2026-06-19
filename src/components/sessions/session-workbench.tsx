"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, FileCode, Radio, Send } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  useNodeAgents,
  useNodes,
  useSessionMessages,
} from "@/features/api/resources";
import { User } from "@/features/api/types";
import { normalizeMailboxMessage } from "@/features/runtime/normalize-mailbox-message";
import { mergeEvents } from "@/features/runtime/merge-session-events";
import { SessionEvent } from "@/features/runtime/session-events";
import { useAgentTunnel } from "@/features/runtime/use-agent-tunnel";
import { compactId } from "@/lib/format";

type SessionWorkbenchProps = {
  user: User;
  sessionId: string;
  nodeId?: string;
  agentId?: string;
};

export function SessionWorkbench({
  user,
  sessionId,
  nodeId,
  agentId,
}: SessionWorkbenchProps) {
  const nodesQuery = useNodes(user.user_id);
  const nodes = nodesQuery.data?.nodes ?? [];
  const activeNodeId = nodeId ?? nodes[0]?.node_id;
  const activeNode = nodes.find((node) => node.node_id === activeNodeId) ?? nodes[0];
  const agentsQuery = useNodeAgents(user.user_id, activeNodeId);
  const agents = agentsQuery.data?.agents ?? [];
  const activeAgentId = agentId ?? agents[0]?.agent_id;
  const activeAgent = agents.find((agent) => agent.agent_id === activeAgentId);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<Error | null>(null);
  const messagesQuery = useSessionMessages(
    user.user_id,
    activeNodeId,
    activeAgentId,
    sessionId,
  );
  const tunnel = useAgentTunnel(activeAgentId);

  // The timeline merges durable REST history with live WebSocket events. REST
  // gives refresh/resume safety; the tunnel gives low-latency streaming updates.
  const historyEvents = useMemo(
    () =>
      (messagesQuery.data?.messages ?? []).flatMap((message) =>
        normalizeMailboxMessage(message),
      ),
    [messagesQuery.data?.messages],
  );

  const timeline = useMemo(
    () => mergeEvents([...historyEvents, ...tunnel.events]),
    [historyEvents, tunnel.events],
  );
  const canSend =
    Boolean(activeAgentId) &&
    tunnel.status === "connected" &&
    draft.trim().length > 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !activeAgentId) {
      return;
    }

    setSendError(null);
    try {
      await tunnel.sendUserMessage(sessionId, content);
      setDraft("");
    } catch (caught) {
      setSendError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }

  return (
    <ConsoleLayout
      activeAgent={activeAgent}
      activeNode={activeNode}
      nodes={nodes}
      user={user}
    >
      <div className="grid min-h-[calc(100vh-48px)] min-w-0 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="min-w-0 border-b border-hairline bg-surface-1 lg:border-b-0 lg:border-r">
          <div className="border-b border-hairline p-4">
            <Link
              className="inline-flex items-center gap-2 text-sm text-ink-subtle hover:text-ink"
              href="/"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to fleet
            </Link>
            <TruncatedText className="mt-4 text-xl font-medium" tooltip={sessionId}>
              {compactId(sessionId)}
            </TruncatedText>
            <MonoId className="mt-2" tooltip={activeAgentId ?? "No agent selected"}>
              {activeAgentId ? compactId(activeAgentId) : "No agent selected"}
            </MonoId>
          </div>

          <div className="grid gap-0 p-4">
            <ContextRow
              label="Node"
              value={activeNode?.name ?? activeNode?.hostname ?? "unknown"}
            />
            <ContextRow
              label="Agent"
              value={activeAgent?.name ?? activeAgent?.agent_type ?? "unknown"}
            />
            <ContextRow
              label="Session"
              value={compactId(sessionId)}
            />
          </div>
        </aside>

        <section className="flex min-w-0 flex-col overflow-hidden bg-canvas">
          <div className="flex items-center justify-between gap-4 border-b border-hairline bg-surface-1 px-4 py-3">
            <div className="min-w-0">
              <div className="flex min-w-0 max-w-[52vw] gap-1 text-sm text-ink-tertiary">
                <TruncatedText>
                  {activeNode?.name ?? activeNode?.hostname ?? "Unknown node"}
                </TruncatedText>
                <span className="shrink-0">/</span>
                <TruncatedText>
                  {activeAgent?.name ?? activeAgentId ?? "Unknown agent"}
                </TruncatedText>
              </div>
              <div className="mt-1 text-lg font-medium">Workstream</div>
            </div>
            <TunnelBadge status={tunnel.status} />
          </div>

          <div className="flex-1 overflow-auto bg-canvas p-4">
            <div className="mx-auto grid w-full max-w-4xl gap-4">
              <SessionErrors
                messagesError={messagesQuery.error}
                missingRouteState={!activeNodeId || !activeAgentId}
                sendError={sendError ?? tunnel.error}
              />
              {timeline.map((event) => (
                <EventCard event={event} key={event.id} />
              ))}
              {!messagesQuery.isLoading && timeline.length === 0 && (
                <div className="rounded-lg border border-dashed border-hairline bg-surface-1 p-4 text-sm text-ink-tertiary">
                  No messages yet. Live tunnel events will appear here.
                </div>
              )}
            </div>
          </div>

          <form
            className="border-t border-hairline bg-surface-1 p-3"
            onSubmit={handleSubmit}
          >
            <div className="mx-auto flex w-full max-w-4xl items-end gap-3">
              <textarea
                className="min-h-20 flex-1 resize-none rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none transition focus:border-primary-focus focus:ring-2 focus:ring-primary-focus/20"
                disabled={!activeAgentId}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  activeAgentId
                    ? "Send a prompt through the ACP tunnel"
                    : "Select an agent before sending a prompt"
                }
                value={draft}
              />
              <Button
                disabled={!canSend}
                icon={<Send className="h-4 w-4" />}
                size="icon"
                tooltip="Send prompt"
                type="submit"
                variant="primary"
              >
              </Button>
            </div>
          </form>
        </section>

        <aside className="min-w-0 border-t border-hairline bg-surface-1 lg:border-l lg:border-t-0">
          <div className="border-b border-hairline p-4">
            <div className="text-sm font-medium text-ink">Evidence</div>
            <div className="mt-1 text-xs text-ink-tertiary">
              REST history and tunnel state
            </div>
          </div>
          <div className="grid gap-0 p-4">
            <StatusRow label="REST messages" value={queryState(messagesQuery)} />
            <StatusRow label="WebSocket tunnel" value={tunnel.status} />
            <StatusRow
              label="Endpoint"
              value={
                activeAgentId
                  ? `/api/v1/user/self/agents/${activeAgentId}/tunnel`
                  : "waiting for agent"
              }
            />
            <StatusRow
              label="Timeline events"
              value={String(timeline.length)}
            />
          </div>
        </aside>
      </div>
    </ConsoleLayout>
  );
}

function EventCard({ event }: { event: SessionEvent }) {
  if (event.type === "file_change") {
    return (
      <article className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-tertiary">
          <FileCode className="h-4 w-4" />
          file change
        </div>
        <MonoId className="mt-2 text-sm text-ink" tooltip={event.path}>
          {event.path}
        </MonoId>
      </article>
    );
  }

  if (event.type === "tool_call") {
    return (
      <article className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="text-xs uppercase tracking-wide text-ink-tertiary">
          tool call / {event.status}
        </div>
        <MonoId className="mt-2 text-sm text-ink" tooltip={event.name}>
          {event.name}
        </MonoId>
      </article>
    );
  }

  if (event.type === "progress") {
    return (
      <article className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="text-xs uppercase tracking-wide text-ink-tertiary">
          thought
        </div>
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-muted">
          {event.content}
        </div>
      </article>
    );
  }

  if (event.type === "token_usage" || event.type === "run_status") {
    return (
      <article className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
        <div className="text-xs uppercase tracking-wide text-ink-tertiary">
          {event.type}
        </div>
        <pre className="mt-2 max-w-full overflow-auto text-xs text-ink-muted">
          {JSON.stringify(event, null, 2)}
        </pre>
      </article>
    );
  }

  return (
    <article
      className={`max-w-[min(82%,720px)] overflow-hidden rounded-lg border p-3 ${
        event.type === "user_message"
          ? "justify-self-end border-hairline-strong bg-surface-2"
          : "justify-self-start border-hairline bg-surface-1"
      }`}
    >
      <div className="text-xs text-ink-tertiary">
        {event.type === "user_message" ? "you" : "agent"}
        {" / "}
        {new Date(event.createdAt).toLocaleTimeString()}
      </div>
      <div className="mt-2 overflow-hidden whitespace-pre-wrap break-words text-sm leading-7 text-ink-muted">
        {event.content}
      </div>
    </article>
  );
}

function TunnelBadge({ status }: { status: string }) {
  return (
    <Badge className="max-w-36" tooltip={status}>
      <Radio className="h-3.5 w-3.5" />
      {status}
    </Badge>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-hairline py-3 last:border-b-0">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <MonoId className="mt-1 text-ink-muted" tooltip={value}>
        {value.includes("/agents/") || value.startsWith("agent_") || value.startsWith("sess_")
          ? compactId(value, 18, 10)
          : value}
      </MonoId>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-hairline py-3 last:border-b-0">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <TruncatedText className="mt-1 text-sm text-ink-muted" tooltip={value}>
        {value}
      </TruncatedText>
    </div>
  );
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

function queryState(query: { isLoading: boolean; isError: boolean }) {
  if (query.isLoading) {
    return "loading";
  }

  if (query.isError) {
    return "error";
  }

  return "loaded";
}
