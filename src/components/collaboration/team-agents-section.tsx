"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { useTeamInvalidation } from "@/features/api/invalidation";
import {
  addTeamAgent,
  removeTeamAgent,
  useAgents,
} from "@/features/api/resources";
import { TeamAgent } from "@/features/api/types";
import { compactId } from "@/lib/format";
import { agentDisplayName, agentStatusTone } from "./team-format";

export function TeamAgentsSection({
  isLoading,
  isOwner,
  teamAgents,
  teamId,
  userId,
}: {
  isLoading: boolean;
  isOwner: boolean;
  teamAgents: TeamAgent[];
  teamId: string;
  userId: string;
}) {
  return (
    <section className="grid gap-3">
      {isLoading && <EmptyState label="Loading team agents" />}
      <div className="grid overflow-hidden rounded-lg border border-hairline">
        {teamAgents.map((teamAgent) => (
          <TeamAgentRow
            isOwner={isOwner}
            key={teamAgent.agent_id}
            teamAgent={teamAgent}
            teamId={teamId}
            userId={userId}
          />
        ))}
        {!isLoading && teamAgents.length === 0 && (
          <EmptyState label="No agents added" />
        )}
      </div>
    </section>
  );
}

export function AddAgentControl({
  teamAgents,
  teamId,
  userId,
}: {
  teamAgents: TeamAgent[];
  teamId: string;
  userId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        icon={<Bot className="h-4 w-4" />}
        onClick={() => setOpen(true)}
        size="sm"
        type="button"
        variant="primary"
      >
        Add agent
      </Button>
      {open && (
        <AddAgentDialog
          onClose={() => setOpen(false)}
          teamAgents={teamAgents}
          teamId={teamId}
          userId={userId}
        />
      )}
    </>
  );
}

function AddAgentDialog({
  onClose,
  teamAgents,
  teamId,
  userId,
}: {
  onClose: () => void;
  teamAgents: TeamAgent[];
  teamId: string;
  userId: string;
}) {
  const invalidateTeams = useTeamInvalidation(userId);
  // Fetched only while this dialog is mounted, so the agents list loads on
  // demand instead of on every teams page load.
  const agentsQuery = useAgents(userId);
  const availableAgents = useMemo(() => {
    const teamAgentIds = new Set(teamAgents.map((agent) => agent.agent_id));
    return (agentsQuery.data?.agents ?? []).filter(
      (agent) => !teamAgentIds.has(agent.agent_id),
    );
  }, [agentsQuery.data?.agents, teamAgents]);
  const [agentId, setAgentId] = useState("");
  const selectedAgentId = agentId || availableAgents[0]?.agent_id || "";
  const add = useMutation({
    mutationFn: () => addTeamAgent(userId, teamId, selectedAgentId),
    onSuccess: () => {
      invalidateTeams();
      onClose();
    },
  });

  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),440px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="grid gap-1">
            <Dialog.Title className="text-base font-medium text-ink">
              Add agent
            </Dialog.Title>
            <Dialog.Description className="text-sm leading-6 text-ink-muted">
              Select one of your agents to add to this team.
            </Dialog.Description>
          </div>
          <select
            className="min-h-9 min-w-0 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
            disabled={agentsQuery.isLoading}
            onChange={(event) => setAgentId(event.target.value)}
            value={selectedAgentId}
          >
            {availableAgents.map((agent) => (
              <option key={agent.agent_id} value={agent.agent_id}>
                {agentDisplayName(agent)}
              </option>
            ))}
            {availableAgents.length === 0 && (
              <option value="">
                {agentsQuery.isLoading
                  ? "Loading agents"
                  : "No available agents"}
              </option>
            )}
          </select>
          <p className="text-xs leading-5 text-danger">
            Agents added to a team receive messages from the other agents in the
            team.
          </p>
          {add.error && <InlineError error={add.error} />}
          <div className="flex justify-end gap-2 border-t border-hairline pt-3">
            <Dialog.Close asChild>
              <Button disabled={add.isPending} type="button" variant="ghost">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              disabled={add.isPending || !selectedAgentId}
              icon={<Bot className="h-4 w-4" />}
              onClick={() => add.mutate()}
              type="button"
              variant="primary"
            >
              Add agent
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TeamAgentRow({
  isOwner,
  teamAgent,
  teamId,
  userId,
}: {
  isOwner: boolean;
  teamAgent: TeamAgent;
  teamId: string;
  userId: string;
}) {
  const invalidateTeams = useTeamInvalidation(userId);
  const remove = useMutation({
    mutationFn: () => removeTeamAgent(userId, teamId, teamAgent.agent_id),
    onSuccess: invalidateTeams,
  });
  const canRemove = isOwner || teamAgent.agent_owner_user_id === userId;
  const agent = teamAgent.agent;
  const ownerLabel =
    teamAgent.agent_owner_email || compactId(teamAgent.agent_owner_user_id);
  const agentMeta = [agent?.agent_type, agent?.machine_type, agent?.os].filter(
    Boolean,
  );
  const status = agent?.status;
  const statusTone = agentStatusTone(status);
  const statusDotClass = {
    danger: "bg-danger",
    neutral: "bg-ink-tertiary",
    success: "bg-success",
  }[statusTone];
  const statusTextClass = {
    danger: "text-danger",
    neutral: "",
    success: "text-success",
  }[statusTone];

  return (
    <article className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_92px] sm:items-center">
      <div className="min-w-0">
        <TruncatedText className="text-sm font-medium">
          {agent ? agentDisplayName(agent) : teamAgent.agent_id}
        </TruncatedText>
        <MonoId tooltip={teamAgent.agent_id}>
          {compactId(teamAgent.agent_id)}
        </MonoId>
      </div>
      <div className="min-w-0">
        <TruncatedText className="text-xs text-ink-tertiary">
          owner {ownerLabel}
        </TruncatedText>
        {(agentMeta.length > 0 || status) && (
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-ink-tertiary">
            {agentMeta.length > 0 && (
              <TruncatedText>{agentMeta.join(" / ")}</TruncatedText>
            )}
            {agentMeta.length > 0 && status && (
              <span className="shrink-0">/</span>
            )}
            {status && (
              <span className="flex shrink-0 items-center gap-1">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`}
                />
                <span className={statusTextClass}>{status}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <Button
        disabled={!canRemove || remove.isPending}
        onClick={() => remove.mutate()}
        size="sm"
        tooltip={
          canRemove
            ? "Remove agent"
            : "Operators can only remove agents they own"
        }
        type="button"
        variant="danger"
      >
        Remove
      </Button>
      {remove.error && <InlineError error={remove.error} />}
    </article>
  );
}
