"use client";

import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  Check,
  MailPlus,
  Plus,
  Shield,
  Users,
  X,
} from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  acceptFriend,
  acceptTeamInvite,
  addTeamAgent,
  blockFriend,
  createFriend,
  createTeam,
  createTeamInvite,
  declineTeamInvite,
  leaveTeam,
  listNodeAgents,
  removeFriend,
  removeTeamAgent,
  removeTeamMember,
  updateFriendAlias,
  useFriends,
  useNodes,
  useTeamAgents,
  useTeamInvites,
  useTeamMembers,
  useTeams,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import { Agent, Friend, TeamAgent, TeamInvite, TeamMember, TeamRole, TeamSummary, User } from "@/features/api/types";
import { compactId } from "@/lib/format";

type TeamFriendsPageClientProps = {
  user: User;
};

export function TeamFriendsPageClient({ user }: TeamFriendsPageClientProps) {
  const queryClient = useQueryClient();
  const nodesQuery = useNodes(user.user_id);
  const nodes = nodesQuery.data?.nodes ?? [];
  const agentQueries = useQueries({
    queries: nodes.map((node) => ({
      queryKey: queryKeys.agents(user.user_id, node.node_id),
      queryFn: () => listNodeAgents(user.user_id, node.node_id),
      enabled: Boolean(user.user_id && node.node_id),
    })),
  });
  const availableAgents = agentQueries.flatMap(
    (query) => query.data?.agents ?? [],
  );
  const teamsQuery = useTeams(user.user_id);
  const teamInvitesQuery = useTeamInvites(user.user_id);
  const friendsQuery = useFriends(user.user_id);
  const teams = teamsQuery.data?.teams ?? [];
  const friends = friendsQuery.data?.friends ?? [];
  const teamInvites = teamInvitesQuery.data?.invites ?? [];
  const [selectedTeamId, setSelectedTeamId] = useState<string | undefined>();
  const selectedTeam =
    teams.find((team) => team.team_id === selectedTeamId) ?? teams[0];
  const membersQuery = useTeamMembers(user.user_id, selectedTeam?.team_id);
  const teamAgentsQuery = useTeamAgents(user.user_id, selectedTeam?.team_id);
  const members = membersQuery.data?.members ?? [];
  const teamAgents = teamAgentsQuery.data?.agents ?? [];
  const activeNode = nodes[0];
  const activeAgent = availableAgents[0];
  const invalidateTeams = () => {
    void queryClient.invalidateQueries({
      queryKey: ["users", user.user_id, "teams"],
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.teamInvites(user.user_id),
    });
  };
  const invalidateFriends = () => {
    void queryClient.invalidateQueries({
      queryKey: ["users", user.user_id, "friends"],
    });
  };

  return (
    <ConsoleLayout
      activeAgent={activeAgent}
      activeNode={activeNode}
      nodes={nodes}
      user={user}
    >
      <div className="grid min-h-[calc(100vh-var(--topbar-h))] min-w-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-hairline bg-surface-1 lg:border-b-0 lg:border-r">
          <header className="border-b border-hairline p-4">
            <div className="flex items-center gap-2 text-xs text-ink-tertiary">
              <Users className="h-4 w-4" />
              trust boundary
            </div>
            <h1 className="mt-2 text-2xl font-semibold">Teams</h1>
          </header>
          <div className="grid gap-4 p-4">
            <CreateTeamForm
              onCreated={invalidateTeams}
              userId={user.user_id}
            />
            <TeamList
              isLoading={teamsQuery.isLoading}
              onSelect={setSelectedTeamId}
              selectedTeamId={selectedTeam?.team_id}
              teams={teams}
            />
            <InviteQueue
              invites={teamInvites}
              isLoading={teamInvitesQuery.isLoading}
              onChanged={invalidateTeams}
              userId={user.user_id}
            />
            <FriendsPanel
              friends={friends}
              isLoading={friendsQuery.isLoading}
              onChanged={invalidateFriends}
              user={user}
            />
          </div>
        </aside>

        <section className="min-w-0 bg-canvas">
          <TeamDetail
            agents={availableAgents}
            isLoading={teamsQuery.isLoading}
            members={members}
            membersLoading={membersQuery.isLoading}
            onChanged={invalidateTeams}
            team={selectedTeam}
            teamAgents={teamAgents}
            teamAgentsLoading={teamAgentsQuery.isLoading}
            user={user}
          />
        </section>
      </div>
    </ConsoleLayout>
  );
}

function CreateTeamForm({
  onCreated,
  userId,
}: {
  onCreated: () => void;
  userId: string;
}) {
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => createTeam(userId, name.trim()),
    onSuccess: () => {
      setName("");
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
    <form className="grid gap-2" onSubmit={submit}>
      <label className="text-xs text-ink-tertiary">Create team</label>
      <div className="flex min-w-0 gap-2">
        <input
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setName(event.target.value)}
          placeholder="Team name"
          value={name}
        />
        <Button
          disabled={create.isPending || !name.trim()}
          icon={<Plus className="h-4 w-4" />}
          size="icon"
          tooltip="Create team"
          type="submit"
          variant="primary"
        />
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
        {teams.map((team) => (
          <button
            className={`grid min-w-0 gap-1 border-b border-hairline px-3 py-2.5 text-left transition last:border-b-0 ${
              team.team_id === selectedTeamId
                ? "bg-surface-2 text-ink"
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
              <Badge>{team.my_role}</Badge>
            </div>
            <MonoId tooltip={team.team_id}>{compactId(team.team_id)}</MonoId>
            <div className="text-xs text-ink-tertiary">
              {team.member_count} members / {team.agent_count} agents
            </div>
          </button>
        ))}
        {teams.length === 0 && <EmptyState label="No teams" />}
      </div>
    </section>
  );
}

function InviteQueue({
  invites,
  isLoading,
  onChanged,
  userId,
}: {
  invites: TeamInvite[];
  isLoading: boolean;
  onChanged: () => void;
  userId: string;
}) {
  const accept = useMutation({
    mutationFn: (inviteId: string) => acceptTeamInvite(userId, inviteId),
    onSuccess: onChanged,
  });
  const decline = useMutation({
    mutationFn: (inviteId: string) => declineTeamInvite(userId, inviteId),
    onSuccess: onChanged,
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
            <Badge tone="warning">{invite.role}</Badge>
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

function FriendsPanel({
  friends,
  isLoading,
  onChanged,
  user,
}: {
  friends: Friend[];
  isLoading: boolean;
  onChanged: () => void;
  user: User;
}) {
  const [email, setEmail] = useState("");
  const [alias, setAlias] = useState("");
  const create = useMutation({
    mutationFn: () => createFriend(user.user_id, email.trim(), alias.trim()),
    onSuccess: () => {
      setEmail("");
      setAlias("");
      onChanged();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) {
      create.mutate();
    }
  }

  return (
    <section className="grid gap-2">
      <SectionTitle count={friends.length} title="Friends" />
      <form className="grid gap-2" onSubmit={submit}>
        <input
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="friend@example.com"
          type="email"
          value={email}
        />
        <div className="flex min-w-0 gap-2">
          <input
            className="min-h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
            onChange={(event) => setAlias(event.target.value)}
            placeholder="Alias"
            value={alias}
          />
          <Button
            disabled={create.isPending || !email.trim()}
            icon={<MailPlus className="h-4 w-4" />}
            size="icon"
            tooltip="Create friend request"
            type="submit"
            variant="primary"
          />
        </div>
        {create.error && <InlineError error={create.error} />}
      </form>
      {isLoading && <EmptyState label="Loading friends" />}
      {!isLoading && friends.length === 0 && <EmptyState label="No friends" />}
      {friends.map((friend) => (
        <FriendRow
          friend={friend}
          key={friend.friend_id}
          onChanged={onChanged}
          user={user}
        />
      ))}
    </section>
  );
}

function FriendRow({
  friend,
  onChanged,
  user,
}: {
  friend: Friend;
  onChanged: () => void;
  user: User;
}) {
  const [alias, setAlias] = useState(friendAlias(friend, user) ?? "");
  const isReceived =
    friend.recipient_user_id === user.user_id ||
    friend.recipient_email === user.email;
  const isPending = friend.status === "pending";
  const accept = useMutation({
    mutationFn: () => acceptFriend(user.user_id, friend.friend_id, alias.trim()),
    onSuccess: onChanged,
  });
  const saveAlias = useMutation({
    mutationFn: () =>
      updateFriendAlias(user.user_id, friend.friend_id, alias.trim()),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => removeFriend(user.user_id, friend.friend_id),
    onSuccess: onChanged,
  });
  const block = useMutation({
    mutationFn: () => blockFriend(user.user_id, friend.friend_id),
    onSuccess: onChanged,
  });

  return (
    <article className="grid gap-2 rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <TruncatedText className="text-sm font-medium">
          {friendCounterpartyEmail(friend, user)}
        </TruncatedText>
        <Badge tone={friend.status === "accepted" ? "success" : "warning"}>
          {friend.status}
        </Badge>
      </div>
      <div className="flex min-w-0 gap-2">
        <input
          className="min-h-8 min-w-0 flex-1 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setAlias(event.target.value)}
          placeholder="Alias"
          value={alias}
        />
        <Button
          disabled={saveAlias.isPending || !alias.trim()}
          onClick={() => saveAlias.mutate()}
          size="sm"
          type="button"
        >
          Alias
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {isPending && isReceived && (
          <Button
            disabled={accept.isPending}
            onClick={() => accept.mutate()}
            size="sm"
            type="button"
            variant="primary"
          >
            Accept
          </Button>
        )}
        <Button
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
          size="sm"
          type="button"
        >
          Remove
        </Button>
        <Button
          disabled={block.isPending}
          onClick={() => block.mutate()}
          size="sm"
          type="button"
          variant="danger"
        >
          Block
        </Button>
      </div>
    </article>
  );
}

function TeamDetail({
  agents,
  isLoading,
  members,
  membersLoading,
  onChanged,
  team,
  teamAgents,
  teamAgentsLoading,
  user,
}: {
  agents: Agent[];
  isLoading: boolean;
  members: TeamMember[];
  membersLoading: boolean;
  onChanged: () => void;
  team?: TeamSummary;
  teamAgents: TeamAgent[];
  teamAgentsLoading: boolean;
  user: User;
}) {
  const isOwner = team?.my_role === "owner";
  const canManageOwnAgents = team?.my_role === "owner" || team?.my_role === "operator";

  if (isLoading) {
    return <div className="p-5"><EmptyState label="Loading team detail" /></div>;
  }

  if (!team) {
    return <div className="p-5"><EmptyState label="Select or create a team" /></div>;
  }

  return (
    <div className="grid min-w-0 gap-5 p-5">
      <header className="flex min-w-0 items-start justify-between gap-4 border-b border-hairline pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            <Shield className="h-4 w-4" />
            team detail
          </div>
          <TruncatedText className="mt-2 text-2xl font-semibold">
            {team.name}
          </TruncatedText>
          <MonoId className="mt-1" tooltip={team.team_id}>
            {compactId(team.team_id)}
          </MonoId>
        </div>
        <Badge>{team.my_role}</Badge>
      </header>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="grid gap-3">
          <SectionTitle count={members.length} title="Members" />
          {isOwner && (
            <InviteMemberForm
              onChanged={onChanged}
              teamId={team.team_id}
              userId={user.user_id}
            />
          )}
          {membersLoading && <EmptyState label="Loading members" />}
          <div className="grid overflow-hidden rounded-lg border border-hairline">
            {members.map((member) => (
              <MemberRow
                canRemove={isOwner && member.role !== "owner"}
                key={member.user_id}
                member={member}
                onChanged={onChanged}
                teamId={team.team_id}
                userId={user.user_id}
              />
            ))}
            {!membersLoading && members.length === 0 && (
              <EmptyState label="No active members" />
            )}
          </div>
        </section>

        <section className="grid content-start gap-3">
          <SectionTitle count={teamAgents.length} title="Team agents" />
          {canManageOwnAgents && (
            <AddAgentForm
              agents={agents}
              onChanged={onChanged}
              teamAgents={teamAgents}
              teamId={team.team_id}
              userId={user.user_id}
            />
          )}
          {teamAgentsLoading && <EmptyState label="Loading team agents" />}
          <div className="grid gap-2">
            {teamAgents.map((teamAgent) => (
              <TeamAgentRow
                canRemove={
                  isOwner || teamAgent.agent_owner_user_id === user.user_id
                }
                key={teamAgent.agent_id}
                onChanged={onChanged}
                teamAgent={teamAgent}
                teamId={team.team_id}
                userId={user.user_id}
              />
            ))}
            {!teamAgentsLoading && teamAgents.length === 0 && (
              <EmptyState label="No agents added" />
            )}
          </div>
          <Button
            disabled={team.my_role === "owner"}
            onClick={() => void leaveTeam(user.user_id, team.team_id).then(onChanged)}
            type="button"
            variant="danger"
          >
            Leave team
          </Button>
        </section>
      </div>
    </div>
  );
}

function InviteMemberForm({
  onChanged,
  teamId,
  userId,
}: {
  onChanged: () => void;
  teamId: string;
  userId: string;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("member");
  const invite = useMutation({
    mutationFn: () => createTeamInvite(userId, teamId, email.trim(), role),
    onSuccess: () => {
      setEmail("");
      setRole("member");
      onChanged();
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) {
      invite.mutate();
    }
  }

  return (
    <form className="flex min-w-0 flex-wrap items-end gap-2" onSubmit={submit}>
      <label className="grid min-w-56 flex-1 gap-1 text-xs text-ink-tertiary">
        Invite email
        <input
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setEmail(event.target.value)}
          type="email"
          value={email}
        />
      </label>
      <label className="grid w-36 gap-1 text-xs text-ink-tertiary">
        Role
        <select
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) =>
            setRole(event.target.value as Exclude<TeamRole, "owner">)
          }
          value={role}
        >
          <option value="member">member</option>
          <option value="operator">operator</option>
        </select>
      </label>
      <Button
        disabled={invite.isPending || !email.trim()}
        icon={<MailPlus className="h-4 w-4" />}
        type="submit"
        variant="primary"
      >
        Invite
      </Button>
      {invite.error && <InlineError error={invite.error} />}
    </form>
  );
}

function MemberRow({
  canRemove,
  member,
  onChanged,
  teamId,
  userId,
}: {
  canRemove: boolean;
  member: TeamMember;
  onChanged: () => void;
  teamId: string;
  userId: string;
}) {
  const remove = useMutation({
    mutationFn: () => removeTeamMember(userId, teamId, member.user_id),
    onSuccess: onChanged,
  });

  return (
    <article className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_120px_88px]">
      <div className="min-w-0">
        <TruncatedText className="text-sm font-medium">
          {member.email ?? member.user_id}
        </TruncatedText>
        <MonoId tooltip={member.user_id}>{compactId(member.user_id)}</MonoId>
      </div>
      <Badge>{member.role}</Badge>
      <Button
        disabled={!canRemove || remove.isPending}
        onClick={() => remove.mutate()}
        size="sm"
        tooltip={canRemove ? "Remove member" : "Only owners can remove non-owner members"}
        type="button"
        variant="danger"
      >
        Remove
      </Button>
    </article>
  );
}

function AddAgentForm({
  agents,
  onChanged,
  teamAgents,
  teamId,
  userId,
}: {
  agents: Agent[];
  onChanged: () => void;
  teamAgents: TeamAgent[];
  teamId: string;
  userId: string;
}) {
  const availableAgents = useMemo(() => {
    const teamAgentIds = new Set(teamAgents.map((agent) => agent.agent_id));
    return agents.filter((agent) => !teamAgentIds.has(agent.agent_id));
  }, [agents, teamAgents]);
  const [agentId, setAgentId] = useState("");
  const selectedAgentId = agentId || availableAgents[0]?.agent_id || "";
  const add = useMutation({
    mutationFn: () => addTeamAgent(userId, teamId, selectedAgentId),
    onSuccess: onChanged,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedAgentId) {
      add.mutate();
    }
  }

  return (
    <form className="flex min-w-0 gap-2" onSubmit={submit}>
      <select
        className="min-h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
        onChange={(event) => setAgentId(event.target.value)}
        value={selectedAgentId}
      >
        {availableAgents.map((agent) => (
          <option key={agent.agent_id} value={agent.agent_id}>
            {agentDisplayName(agent)}
          </option>
        ))}
      </select>
      <Button
        disabled={add.isPending || !selectedAgentId}
        icon={<Bot className="h-4 w-4" />}
        size="icon"
        tooltip="Add agent"
        type="submit"
        variant="primary"
      />
    </form>
  );
}

function TeamAgentRow({
  canRemove,
  onChanged,
  teamAgent,
  teamId,
  userId,
}: {
  canRemove: boolean;
  onChanged: () => void;
  teamAgent: TeamAgent;
  teamId: string;
  userId: string;
}) {
  const remove = useMutation({
    mutationFn: () => removeTeamAgent(userId, teamId, teamAgent.agent_id),
    onSuccess: onChanged,
  });

  return (
    <article className="grid gap-2 rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <TruncatedText className="text-sm font-medium">
          {teamAgent.agent ? agentDisplayName(teamAgent.agent) : teamAgent.agent_id}
        </TruncatedText>
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
      </div>
      <MonoId tooltip={teamAgent.agent_id}>
        {compactId(teamAgent.agent_id)}
      </MonoId>
      <MonoId tooltip={teamAgent.agent_owner_user_id}>
        owner {compactId(teamAgent.agent_owner_user_id)}
      </MonoId>
    </article>
  );
}

function SectionTitle({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <TruncatedText className="text-sm font-medium">{title}</TruncatedText>
      <Badge className="font-mono">{String(count)}</Badge>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface-1 p-3 text-sm text-ink-tertiary">
      {label}
    </div>
  );
}

function InlineError({ error }: { error: Error }) {
  return (
    <TruncatedText className="text-xs text-warning">
      {error.name}: {error.message}
    </TruncatedText>
  );
}

function agentDisplayName(agent: Agent) {
  return agent.name ?? agent.hostname ?? agent.agent_id;
}

function friendCounterpartyEmail(friend: Friend, user: User) {
  if (friend.requester_user_id === user.user_id) {
    return friend.recipient_email;
  }
  return friend.requester_email;
}

function friendAlias(friend: Friend, user: User) {
  if (friend.requester_user_id === user.user_id) {
    return friend.requester_alias;
  }
  return friend.recipient_alias;
}
