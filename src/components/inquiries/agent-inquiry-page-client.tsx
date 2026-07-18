"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ExternalLink,
  MessageSquareText,
  RefreshCw,
  Send,
  UserRoundPlus,
} from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { ApiError } from "@/features/api/errors";
import { queryKeys } from "@/features/api/query-keys";
import {
  listNodeAgents,
  startAgentInquiry,
  upsertRepresentativeAgent,
  useConversationMessages,
  useNodes,
  useRepresentativeAgents,
} from "@/features/api/resources";
import { Agent, RepresentativeAgent, User } from "@/features/api/types";
import { compactId } from "@/lib/format";
import {
  agentLabel,
  byLastActiveDesc,
  nodeLabel,
  resourceLastActiveAt,
} from "../resources/resource-models";

type AgentOption = Agent & {
  nodeLabel: string;
};

type AgentInquiryPageClientProps = {
  user: User;
};

export function AgentInquiryPageClient({ user }: AgentInquiryPageClientProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [sourceAgentId, setSourceAgentId] = useState("");
  const [targetAgentId, setTargetAgentId] = useState("");
  const [input, setInput] = useState("Can you review this inquiry?");
  const [maxTurns, setMaxTurns] = useState(1);
  const [conversationId, setConversationId] = useState("");
  const nodesQuery = useNodes(user.user_id);
  const nodes = useMemo(
    () =>
      byLastActiveDesc(
        nodesQuery.data?.nodes ?? [],
        resourceLastActiveAt,
        nodeLabel,
      ),
    [nodesQuery.data?.nodes],
  );
  const agentQueries = useQueries({
    queries: nodes.map((node) => ({
      queryKey: queryKeys.agents(user.user_id, node.node_id),
      queryFn: () => listNodeAgents(user.user_id, node.node_id),
      enabled: Boolean(user.user_id && node.node_id),
    })),
  });
  const agents = useMemo(
    () =>
      byLastActiveDesc(
        agentQueries
          .flatMap((query) => query.data?.agents ?? [])
          .map((agent) => ({
            ...agent,
            nodeLabel:
              nodes.find((node) => node.node_id === agent.node_id)?.name ??
              nodes.find((node) => node.node_id === agent.node_id)?.hostname ??
              agent.node_id,
          })),
        resourceLastActiveAt,
        agentLabel,
      ),
    [agentQueries, nodes],
  );

  const effectiveSourceAgentId = sourceAgentId || agents[0]?.agent_id || "";
  const effectiveTargetAgentId =
    targetAgentId ||
    agents.find((agent) => agent.agent_id !== effectiveSourceAgentId)
      ?.agent_id ||
    effectiveSourceAgentId;
  const sourceAgent = agents.find(
    (agent) => agent.agent_id === effectiveSourceAgentId,
  );
  const targetAgent = agents.find(
    (agent) => agent.agent_id === effectiveTargetAgentId,
  );
  const sourceRepQuery = useRepresentativeAgents(
    user.user_id,
    effectiveSourceAgentId,
  );
  const targetRepQuery = useRepresentativeAgents(
    user.user_id,
    effectiveTargetAgentId,
  );
  const sourceRep = sourceRepQuery.data?.representative_agents[0];
  const targetRep = targetRepQuery.data?.representative_agents[0];
  const messagesQuery = useConversationMessages(
    user.user_id,
    conversationId || undefined,
    100,
  );

  const ensureRepMutation = useMutation({
    mutationFn: (agent: AgentOption) =>
      upsertRepresentativeAgent(user.user_id, {
        display_name: agentLabel(agent),
        runtime_agent_id: agent.agent_id,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.representativeAgents(
          user.user_id,
          data.representative_agent.runtime_agent_id,
        ),
      });
    },
  });

  const inquiryMutation = useMutation({
    mutationFn: async () => {
      if (!sourceAgent || !targetAgent) {
        throw new Error("Select source and target agents");
      }
      const ensuredSourceRep =
        sourceRep ??
        (await ensureRepMutation.mutateAsync(sourceAgent)).representative_agent;
      const ensuredTargetRep =
        targetRep ??
        (await ensureRepMutation.mutateAsync(targetAgent)).representative_agent;
      return startAgentInquiry(
        user.user_id,
        sourceAgent.node_id,
        sourceAgent.agent_id,
        {
          conversation_id: conversationId || undefined,
          from_representative_agent_id:
            ensuredSourceRep.representative_agent_id,
          input,
          max_turns: maxTurns,
          to_representative_agent_id: ensuredTargetRep.representative_agent_id,
        },
      );
    },
    onSuccess: (data) => {
      setConversationId(data.conversation.conversation_id);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.conversationMessages(
          user.user_id,
          data.conversation.conversation_id,
        ),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.sessions(
          user.user_id,
          data.source_session.node_id,
          data.source_session.agent_id,
        ),
      });
    },
  });

  const loadingAgents =
    nodesQuery.isLoading || agentQueries.some((query) => query.isLoading);
  const error =
    inquiryMutation.error ??
    ensureRepMutation.error ??
    messagesQuery.error ??
    sourceRepQuery.error ??
    targetRepQuery.error ??
    nodesQuery.error ??
    agentQueries.find((query) => query.error)?.error;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim()) {
      return;
    }
    inquiryMutation.mutate();
  }

  return (
    <ConsoleLayout user={user}>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <MessageSquareText className="h-4 w-4 text-ink-subtle" />
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
                  Settings
                </div>
                <h1 className="mt-1 text-lg font-semibold">Agent inquiries</h1>
              </div>
            </div>
            <Button
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => {
                void nodesQuery.refetch();
                void sourceRepQuery.refetch();
                void targetRepQuery.refetch();
                void messagesQuery.refetch();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Refresh
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] overflow-hidden">
          <aside className="min-h-0 overflow-y-auto border-r border-hairline bg-surface-1/60 p-4">
            <div className="grid gap-4">
              <AgentSelector
                agents={agents}
                label="Source agent"
                loading={loadingAgents}
                mutationPending={ensureRepMutation.isPending}
                onEnsure={() =>
                  sourceAgent && ensureRepMutation.mutate(sourceAgent)
                }
                onSelect={setSourceAgentId}
                representative={sourceRep}
                selectedAgentId={effectiveSourceAgentId}
              />
              <div className="flex justify-center text-ink-tertiary">
                <ArrowRight className="h-4 w-4 rotate-90" />
              </div>
              <AgentSelector
                agents={agents}
                label="Target agent"
                loading={loadingAgents}
                mutationPending={ensureRepMutation.isPending}
                onEnsure={() =>
                  targetAgent && ensureRepMutation.mutate(targetAgent)
                }
                onSelect={setTargetAgentId}
                representative={targetRep}
                selectedAgentId={effectiveTargetAgentId}
              />
              <div className="border-t border-hairline pt-4">
                <label
                  className="text-xs text-ink-tertiary"
                  htmlFor="conversation-id"
                >
                  Conversation
                </label>
                <input
                  className="mt-2 h-9 w-full rounded-md border border-hairline bg-canvas px-3 font-mono text-xs text-ink outline-none focus:border-hairline-strong"
                  id="conversation-id"
                  onChange={(event) => setConversationId(event.target.value)}
                  placeholder="new conversation"
                  value={conversationId}
                />
              </div>
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden">
            <form
              className="border-b border-hairline bg-canvas/80 p-4"
              onSubmit={handleSubmit}
            >
              <textarea
                className="min-h-32 w-full resize-none rounded-md border border-hairline bg-surface-1 px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-hairline-strong"
                onChange={(event) => setInput(event.target.value)}
                value={input}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label
                    className="text-xs text-ink-tertiary"
                    htmlFor="max-turns"
                  >
                    Turns
                  </label>
                  <input
                    className="h-8 w-16 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink outline-none focus:border-hairline-strong"
                    id="max-turns"
                    max={10}
                    min={1}
                    onChange={(event) =>
                      setMaxTurns(Number.parseInt(event.target.value, 10) || 1)
                    }
                    type="number"
                    value={maxTurns}
                  />
                </div>
                <Button
                  disabled={
                    inquiryMutation.isPending ||
                    !sourceAgent ||
                    !targetAgent ||
                    !input.trim()
                  }
                  icon={<Send className="h-4 w-4" />}
                  type="submit"
                  variant="primary"
                >
                  Send inquiry
                </Button>
              </div>
            </form>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {error && (
                <div className="mb-4 border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                  {errorMessage(error)}
                </div>
              )}
              {inquiryMutation.data && (
                <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-hairline pb-3">
                  <Badge
                    tone={
                      inquiryMutation.data.delivery.status === "delivered"
                        ? "success"
                        : "warning"
                    }
                  >
                    {inquiryMutation.data.delivery.status}
                  </Badge>
                  <MonoId>
                    {inquiryMutation.data.conversation.conversation_id}
                  </MonoId>
                  <Button
                    icon={<ExternalLink className="h-4 w-4" />}
                    onClick={() =>
                      router.push(
                        `/conversations/${encodeURIComponent(
                          inquiryMutation.data.conversation.conversation_id,
                        )}`,
                      )
                    }
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Open conversation
                  </Button>
                  {inquiryMutation.data.delivery.error && (
                    <span className="text-xs text-ink-tertiary">
                      {inquiryMutation.data.delivery.error}
                    </span>
                  )}
                </div>
              )}
              <div className="grid gap-3">
                {(messagesQuery.data?.messages ?? []).map((message) => (
                  <article
                    className="border-l border-hairline-strong py-1 pl-3"
                    key={message.message_id}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <Badge>
                        {message.direction ?? message.role ?? "message"}
                      </Badge>
                      <MonoId>{compactId(message.message_id)}</MonoId>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6 text-ink-muted">
                      {message.parts
                        ?.map((part) => part.text)
                        .filter(Boolean)
                        .join("\n") ?? ""}
                    </div>
                  </article>
                ))}
                {conversationId && messagesQuery.isLoading && (
                  <div className="text-sm text-ink-tertiary">
                    Loading messages
                  </div>
                )}
                {!conversationId && (
                  <div className="text-sm text-ink-tertiary">
                    No conversation selected
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </ConsoleLayout>
  );
}

function AgentSelector({
  agents,
  label,
  loading,
  mutationPending,
  onEnsure,
  onSelect,
  representative,
  selectedAgentId,
}: {
  agents: AgentOption[];
  label: string;
  loading: boolean;
  mutationPending: boolean;
  onEnsure: () => void;
  onSelect: (agentId: string) => void;
  representative?: RepresentativeAgent;
  selectedAgentId: string;
}) {
  const selected = agents.find((agent) => agent.agent_id === selectedAgentId);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-xs text-ink-tertiary">{label}</label>
        <Badge tone={representative ? "success" : "warning"}>
          {representative ? "ready" : "needs representative"}
        </Badge>
      </div>
      <select
        className="h-9 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink outline-none focus:border-hairline-strong"
        disabled={loading || agents.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        value={selectedAgentId}
      >
        {agents.map((agent) => (
          <option key={agent.agent_id} value={agent.agent_id}>
            {agentLabel(agent)} · {agent.nodeLabel}
          </option>
        ))}
      </select>
      <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <TruncatedText className="text-xs text-ink-subtle">
            {selected ? selected.nodeLabel : "No agent"}
          </TruncatedText>
          <MonoId>{selected ? compactId(selected.agent_id) : "agent"}</MonoId>
          {representative && (
            <MonoId>{compactId(representative.representative_agent_id)}</MonoId>
          )}
        </div>
        <Button
          disabled={!selected || Boolean(representative) || mutationPending}
          icon={<UserRoundPlus className="h-4 w-4" />}
          onClick={onEnsure}
          size="sm"
          tooltip={
            representative ? "Representative exists" : "Create representative"
          }
          type="button"
          variant={representative ? "ghost" : "secondary"}
        >
          {representative ? "Created" : "Create representative"}
        </Button>
      </div>
    </div>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return "Request failed";
}
