"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Plus, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { SectionTitle } from "@/components/ui/section-title";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { useTeamInvalidation } from "@/features/api/invalidation";
import {
  acceptTeamInvite,
  createTeam,
  declineTeamInvite,
} from "@/features/api/resources";
import { TeamInvite, TeamSummary } from "@/features/api/types";
import { compactId } from "@/lib/format";
import { displayTeamRole, teamRole, teamRoleBadgeTone } from "./team-format";

type TeamListPanelProps = {
  invites: TeamInvite[];
  invitesLoading: boolean;
  isLoading: boolean;
  onSelect: (teamId: string) => void;
  selectedTeamId?: string;
  teams: TeamSummary[];
  userId: string;
};

export function TeamListPanel({
  invites,
  invitesLoading,
  isLoading,
  onSelect,
  selectedTeamId,
  teams,
  userId,
}: TeamListPanelProps) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <header className="flex items-start justify-between gap-3 border-b border-hairline p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-accent-bright">
            <Users className="h-4 w-4" />
            team workspace
          </div>
          <h1 className="mt-2 text-2xl font-semibold">Teams</h1>
        </div>
        <Button
          icon={<Plus className="h-4 w-4" />}
          onClick={() => setCreateOpen((open) => !open)}
          size="icon"
          tooltip="Create team"
          type="button"
          variant={createOpen ? "primary" : "secondary"}
        />
      </header>
      <div className="grid gap-4 p-4">
        {createOpen && (
          <CreateTeamForm
            onCreated={() => setCreateOpen(false)}
            userId={userId}
          />
        )}
        <TeamList
          isLoading={isLoading}
          onSelect={onSelect}
          selectedTeamId={selectedTeamId}
          teams={teams}
        />
        <InviteQueue
          invites={invites}
          isLoading={invitesLoading}
          userId={userId}
        />
      </div>
    </>
  );
}

function CreateTeamForm({
  onCreated,
  userId,
}: {
  onCreated: () => void;
  userId: string;
}) {
  const invalidateTeams = useTeamInvalidation(userId);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createTeam(userId, name.trim()),
    onSuccess: () => {
      setName("");
      invalidateTeams();
      onCreated();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) {
      create.mutate();
    }
  }

  return (
    <form
      className="grid gap-2 rounded-lg border border-hairline bg-canvas p-3"
      onSubmit={submit}
    >
      <label className="text-sm font-medium text-ink">Create team</label>
      <div className="flex min-w-0 gap-2">
        <input
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setName(event.target.value)}
          placeholder="Team name"
          value={name}
        />
        <Button
          disabled={create.isPending || !name.trim()}
          icon={<Plus className="h-4 w-4" />}
          type="submit"
          variant="primary"
        >
          Create
        </Button>
      </div>
      {create.error && <InlineError error={create.error} />}
    </form>
  );
}

function TeamList({
  isLoading,
  onSelect,
  selectedTeamId,
  teams,
}: {
  isLoading: boolean;
  onSelect: (teamId: string) => void;
  selectedTeamId?: string;
  teams: TeamSummary[];
}) {
  if (isLoading) {
    return <EmptyState label="Loading teams" />;
  }

  return (
    <section className="grid gap-2">
      <SectionTitle count={teams.length} title="Teams" />
      <div className="grid overflow-hidden rounded-lg border border-hairline">
        {teams.map((team) => {
          const selected = team.team_id === selectedTeamId;

          return (
            <button
              className={`grid min-w-0 gap-1 border-b border-hairline px-3 py-2.5 text-left transition last:border-b-0 ${
                selected
                  ? "bg-accent/10 text-ink shadow-[inset_2px_0_0_var(--color-accent)] hover:bg-accent/15"
                  : "bg-surface-1 text-ink-muted hover:bg-surface-2"
              }`}
              key={team.team_id}
              onClick={() => onSelect(team.team_id)}
              type="button"
            >
              <div className="flex min-w-0 items-center justify-between gap-3">
                <TruncatedText className="text-sm font-medium">
                  {team.name}
                </TruncatedText>
                <Badge tone={teamRoleBadgeTone(teamRole(team))}>
                  {displayTeamRole(teamRole(team))}
                </Badge>
              </div>
              <MonoId tooltip={team.team_id}>{compactId(team.team_id)}</MonoId>
              <div className="text-xs text-ink-tertiary">
                {team.member_count} members / {team.agent_count} agents
              </div>
            </button>
          );
        })}
        {teams.length === 0 && <EmptyState label="No teams" />}
      </div>
    </section>
  );
}

function InviteQueue({
  invites,
  isLoading,
  userId,
}: {
  invites: TeamInvite[];
  isLoading: boolean;
  userId: string;
}) {
  const invalidateTeams = useTeamInvalidation(userId);
  const accept = useMutation({
    mutationFn: (inviteId: string) => acceptTeamInvite(userId, inviteId),
    onSuccess: invalidateTeams,
  });
  const decline = useMutation({
    mutationFn: (inviteId: string) => declineTeamInvite(userId, inviteId),
    onSuccess: invalidateTeams,
  });

  return (
    <section className="grid gap-2">
      <SectionTitle count={invites.length} title="Team invites" />
      {isLoading && <EmptyState label="Loading invites" />}
      {!isLoading && invites.length === 0 && (
        <EmptyState label="No pending team invites" />
      )}
      {invites.map((invite) => (
        <article
          className="grid gap-2 rounded-lg border border-hairline bg-surface-1 p-3"
          key={invite.invite_id}
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <TruncatedText className="text-sm font-medium">
              {invite.email}
            </TruncatedText>
            <Badge tone={teamRoleBadgeTone(invite.role)}>
              {displayTeamRole(invite.role)}
            </Badge>
          </div>
          <MonoId tooltip={invite.team_id}>{compactId(invite.team_id)}</MonoId>
          <div className="flex gap-2">
            <Button
              disabled={accept.isPending}
              icon={<Check className="h-4 w-4" />}
              onClick={() => accept.mutate(invite.invite_id)}
              size="sm"
              type="button"
              variant="primary"
            >
              Accept
            </Button>
            <Button
              disabled={decline.isPending}
              icon={<X className="h-4 w-4" />}
              onClick={() => decline.mutate(invite.invite_id)}
              size="sm"
              type="button"
            >
              Decline
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
