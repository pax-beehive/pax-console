"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Bot,
  Check,
  Clock3,
  MailPlus,
  Plus,
  Shield,
  UserCog,
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
  archiveTeam,
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
  updateTeamMemberRole,
  useFriends,
  useNodes,
  useTeamAuditEvents,
  useTeamAgents,
  useTeamInvites,
  useTeamMembers,
  useTeams,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import {
  Agent,
  Friend,
  TeamAgent,
  TeamAuditEvent,
  TeamInvite,
  TeamMember,
  TeamRole,
  TeamSummary,
  User,
} from "@/features/api/types";
import { compactId } from "@/lib/format";

type TeamFriendsPageClientProps = {
  initialWorkspace?: TeamWorkspace;
  user: User;
};

type TeamWorkspace = "teams" | "friends";
type TeamDetailTab = "members" | "agents" | "audit";

function teamWorkspaceFromQuery(value: string | null): TeamWorkspace {
  if (value === "friends") {
    return value;
  }

  return "teams";
}

export function TeamFriendsPageClient({
  initialWorkspace,
  user,
}: TeamFriendsPageClientProps) {
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
  const teamAuditQuery = useTeamAuditEvents(
    user.user_id,
    selectedTeam?.team_id,
  );
  const members = membersQuery.data?.members ?? [];
  const teamAgents = teamAgentsQuery.data?.agents ?? [];
  const auditEvents = teamAuditQuery.data?.events ?? [];
  const searchParams = useSearchParams();
  const workspace =
    initialWorkspace ?? teamWorkspaceFromQuery(searchParams.get("view"));
  const pageTitle = workspace === "friends" ? "Friends" : "Teams";
  const pageEyebrow =
    workspace === "friends" ? "trusted people" : "team workspace";
  const invalidateTeams = (teamId = selectedTeam?.team_id) => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.teams(user.user_id),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.teamInvites(user.user_id),
    });
    if (teamId) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.team(user.user_id, teamId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.teamMembers(user.user_id, teamId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.teamAgents(user.user_id, teamId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.teamAudit(user.user_id, teamId, 50),
      });
    }
  };
  const invalidateFriends = () => {
    void queryClient.invalidateQueries({
      queryKey: ["users", user.user_id, "friends"],
    });
  };

  return (
    <ConsoleLayout user={user}>
      <div className="grid min-h-[calc(100vh-var(--topbar-h))] min-w-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-hairline bg-surface-1 lg:border-b-0 lg:border-r">
          <header className="border-b border-hairline p-4">
            <div className="flex items-center gap-2 text-xs text-ink-tertiary">
              <Users className="h-4 w-4" />
              {pageEyebrow}
            </div>
            <h1 className="mt-2 text-2xl font-semibold">{pageTitle}</h1>
          </header>
          <div className="grid gap-4 p-4">
            {workspace === "teams" && (
              <>
                <CreateTeamForm
                  onCreated={() => invalidateTeams()}
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
              </>
            )}
            {workspace === "friends" && (
              <FriendList
                friends={friends}
                isLoading={friendsQuery.isLoading}
                user={user}
              />
            )}
          </div>
        </aside>

        <section className="min-w-0 bg-canvas">
          {workspace === "teams" && (
            <div className="grid min-w-0 gap-5 p-5">
              <TeamDetail
                agents={availableAgents}
                auditEvents={auditEvents}
                auditLoading={teamAuditQuery.isLoading}
                isLoading={teamsQuery.isLoading}
                members={members}
                membersLoading={membersQuery.isLoading}
                onChanged={() => invalidateTeams()}
                team={selectedTeam}
                teamAgents={teamAgents}
                teamAgentsLoading={teamAgentsQuery.isLoading}
                user={user}
              />
            </div>
          )}
          {workspace === "friends" && (
            <FriendsPanel
              friends={friends}
              isLoading={friendsQuery.isLoading}
              onChanged={invalidateFriends}
              user={user}
            />
          )}
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
    <form
      className="grid gap-2 rounded-lg border border-hairline bg-canvas p-3"
      onSubmit={submit}
    >
      <div className="flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-ink">Create team</label>
        <Button
          disabled={create.isPending || !name.trim()}
          icon={<Plus className="h-4 w-4" />}
          size="icon"
          tooltip="Create team"
          type="submit"
          variant="primary"
        />
      </div>
      <div className="flex min-w-0 gap-2">
        <input
          className="min-h-9 min-w-0 flex-1 rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setName(event.target.value)}
          placeholder="Team name"
          value={name}
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
              <Badge>{displayTeamRole(teamRole(team))}</Badge>
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
            <Badge tone="warning">{displayTeamRole(invite.role)}</Badge>
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

function FriendList({
  friends,
  isLoading,
  user,
}: {
  friends: Friend[];
  isLoading: boolean;
  user: User;
}) {
  if (isLoading) {
    return <EmptyState label="Loading friends" />;
  }

  return (
    <section className="grid gap-2">
      <SectionTitle count={friends.length} title="Friends" />
      <div className="grid overflow-hidden rounded-lg border border-hairline">
        {friends.map((friend) => (
          <div
            className="grid min-w-0 gap-1 border-b border-hairline bg-surface-1 px-3 py-2.5 last:border-b-0"
            key={friend.friend_id}
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <TruncatedText className="text-sm font-medium">
                {friendCounterpartyEmail(friend, user)}
              </TruncatedText>
              <Badge
                tone={friend.status === "accepted" ? "success" : "warning"}
              >
                {friend.status}
              </Badge>
            </div>
            <TruncatedText className="text-xs text-ink-tertiary">
              {friendAlias(friend, user) || "No alias"}
            </TruncatedText>
          </div>
        ))}
        {friends.length === 0 && <EmptyState label="No friends" />}
      </div>
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
    <div className="grid min-w-0 gap-5 p-5">
      <header className="border-b border-hairline pb-4">
        <div className="flex items-center gap-2 text-xs text-ink-tertiary">
          <MailPlus className="h-4 w-4" />
          friend graph
        </div>
        <h2 className="mt-2 text-2xl font-semibold">Friends</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-tertiary">
          Manage direct trust relationships used for envelope delivery.
        </p>
      </header>

      <form
        className="grid max-w-2xl gap-2 rounded-lg border border-hairline bg-surface-1 p-3"
        onSubmit={submit}
      >
        <label className="text-xs text-ink-tertiary">
          Create friend request
        </label>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto]">
          <input
            className="min-h-9 min-w-0 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="friend@example.com"
            type="email"
            value={email}
          />
          <input
            className="min-h-9 min-w-0 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
            onChange={(event) => setAlias(event.target.value)}
            placeholder="Alias"
            value={alias}
          />
          <Button
            disabled={create.isPending || !email.trim()}
            icon={<MailPlus className="h-4 w-4" />}
            type="submit"
            variant="primary"
          >
            Request
          </Button>
        </div>
        {create.error && <InlineError error={create.error} />}
      </form>

      <section className="grid gap-3">
        <SectionTitle count={friends.length} title="Friend records" />
        {isLoading && <EmptyState label="Loading friends" />}
        {!isLoading && friends.length === 0 && (
          <EmptyState label="No friends" />
        )}
        <div className="grid gap-2 xl:grid-cols-2">
          {friends.map((friend) => (
            <FriendRow
              friend={friend}
              key={friend.friend_id}
              onChanged={onChanged}
              user={user}
            />
          ))}
        </div>
      </section>
    </div>
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
    mutationFn: () =>
      acceptFriend(user.user_id, friend.friend_id, alias.trim()),
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
  auditEvents,
  auditLoading,
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
  auditEvents: TeamAuditEvent[];
  auditLoading: boolean;
  isLoading: boolean;
  members: TeamMember[];
  membersLoading: boolean;
  onChanged: () => void;
  team?: TeamSummary;
  teamAgents: TeamAgent[];
  teamAgentsLoading: boolean;
  user: User;
}) {
  const [activeTab, setActiveTab] = useState<TeamDetailTab>("members");
  const role = team ? teamRole(team) : undefined;
  const isOwner = role === "owner";
  const canManageOwnAgents = role === "owner" || role === "operator";
  const archive = useMutation({
    mutationFn: () => archiveTeam(user.user_id, team?.team_id ?? ""),
    onSuccess: onChanged,
  });
  const leave = useMutation({
    mutationFn: () => leaveTeam(user.user_id, team?.team_id ?? ""),
    onSuccess: onChanged,
  });

  function confirmArchive() {
    if (!team) {
      return;
    }
    if (window.confirm(`Archive ${team.name}?`)) {
      archive.mutate();
    }
  }

  function confirmLeave() {
    if (!team) {
      return;
    }
    if (window.confirm(`Leave ${team.name}?`)) {
      leave.mutate();
    }
  }

  if (isLoading) {
    return (
      <div className="p-5">
        <EmptyState label="Loading team detail" />
      </div>
    );
  }

  if (!team) {
    return (
      <div className="p-5">
        <EmptyState label="Select or create a team" />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex min-w-0 items-start justify-between gap-4 border-b border-hairline pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-ink-tertiary">
            <Shield className="h-4 w-4" />
            team workspace
          </div>
          <TruncatedText className="mt-2 text-2xl font-semibold">
            {team.name}
          </TruncatedText>
          <MonoId className="mt-1" tooltip={team.team_id}>
            {compactId(team.team_id)}
          </MonoId>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Badge>{displayTeamRole(role)}</Badge>
          {isOwner && (
            <Button
              disabled={archive.isPending}
              icon={<Archive className="h-4 w-4" />}
              onClick={confirmArchive}
              size="sm"
              tooltip="Archive team"
              type="button"
              variant="danger"
            >
              Archive
            </Button>
          )}
          {!isOwner && (
            <Button
              disabled={leave.isPending}
              onClick={confirmLeave}
              size="sm"
              type="button"
              variant="danger"
            >
              Leave
            </Button>
          )}
        </div>
      </header>
      {archive.error && <InlineError error={archive.error} />}
      {leave.error && <InlineError error={leave.error} />}

      <TeamOverview team={team} role={role ?? "member"} />

      <TeamDetailTabs
        activeTab={activeTab}
        auditCount={auditEvents.length}
        memberCount={members.length}
        onChange={setActiveTab}
        teamAgentCount={teamAgents.length}
      />

      {activeTab === "members" && (
        <section className="grid gap-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <SectionTitle count={members.length} title="Members" />
            {isOwner && (
              <InviteMemberForm
                onChanged={onChanged}
                teamId={team.team_id}
                userId={user.user_id}
              />
            )}
          </div>
          {membersLoading && <EmptyState label="Loading members" />}
          <div className="grid overflow-hidden rounded-lg border border-hairline">
            {members.map((member) => (
              <MemberRow
                canRemove={isOwner && member.role !== "owner"}
                canUpdateRole={isOwner && member.role !== "owner"}
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
      )}

      {activeTab === "agents" && (
        <section className="grid gap-3">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
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
          </div>
          {teamAgentsLoading && <EmptyState label="Loading team agents" />}
          <div className="grid gap-2 xl:grid-cols-2">
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
        </section>
      )}

      {activeTab === "audit" && (
        <section className="grid gap-3">
          <SectionTitle count={auditEvents.length} title="Audit" />
          {auditLoading && <EmptyState label="Loading audit events" />}
          {!auditLoading && auditEvents.length === 0 && (
            <EmptyState label="No audit events" />
          )}
          <div className="grid gap-2 xl:grid-cols-2">
            {auditEvents.map((event) => (
              <AuditEventRow event={event} key={event.event_id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TeamOverview({ role, team }: { role: string; team: TeamSummary }) {
  return (
    <section className="grid overflow-hidden rounded-lg border border-hairline sm:grid-cols-4">
      <TeamMetric label="Your role" value={displayTeamRole(role)} />
      <TeamMetric label="Members" value={String(team.member_count)} />
      <TeamMetric label="Agents" value={String(team.agent_count)} />
      <TeamMetric label="Created" value={compactDate(team.created_at)} />
    </section>
  );
}

function TeamMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 border-b border-hairline bg-surface-1 p-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <div className="text-xs text-ink-tertiary">{label}</div>
      <TruncatedText className="text-sm font-medium text-ink">
        {value}
      </TruncatedText>
    </div>
  );
}

function TeamDetailTabs({
  activeTab,
  auditCount,
  memberCount,
  onChange,
  teamAgentCount,
}: {
  activeTab: TeamDetailTab;
  auditCount: number;
  memberCount: number;
  onChange: (tab: TeamDetailTab) => void;
  teamAgentCount: number;
}) {
  const tabs: Array<{ count: number; label: string; value: TeamDetailTab }> = [
    { count: memberCount, label: "Members", value: "members" },
    { count: teamAgentCount, label: "Agents", value: "agents" },
    { count: auditCount, label: "Audit", value: "audit" },
  ];

  return (
    <div
      aria-label="Team detail sections"
      className="inline-flex w-full max-w-xl overflow-hidden rounded-lg border border-hairline bg-surface-1"
      role="tablist"
    >
      {tabs.map((tab) => {
        const selected = activeTab === tab.value;

        return (
          <button
            aria-label={`${tab.label} (${tab.count})`}
            aria-selected={selected}
            className={`flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 border-r border-hairline px-3 text-sm transition last:border-r-0 ${
              selected
                ? "bg-surface-3 text-ink"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
            key={tab.value}
            onClick={() => onChange(tab.value)}
            role="tab"
            type="button"
          >
            <span className="min-w-0 truncate">{tab.label}</span>
            <Badge className="min-w-[1.75rem] justify-center font-mono">
              {String(tab.count)}
            </Badge>
          </button>
        );
      })}
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
    <form
      className="grid w-full gap-2 rounded-lg border border-hairline bg-surface-1 p-3 xl:w-auto xl:min-w-[520px]"
      onSubmit={submit}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <MailPlus className="h-4 w-4 text-ink-tertiary" />
        Invite member
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
        <input
          className="min-h-9 min-w-0 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="person@example.com"
          type="email"
          value={email}
        />
        <select
          className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) =>
            setRole(event.target.value as Exclude<TeamRole, "owner">)
          }
          value={role}
        >
          <option value="member">Member</option>
          <option value="operator">Operator</option>
        </select>
        <Button
          disabled={invite.isPending || !email.trim()}
          icon={<MailPlus className="h-4 w-4" />}
          type="submit"
          variant="primary"
        >
          Invite
        </Button>
      </div>
      {invite.error && <InlineError error={invite.error} />}
    </form>
  );
}

function MemberRow({
  canRemove,
  canUpdateRole,
  member,
  onChanged,
  teamId,
  userId,
}: {
  canRemove: boolean;
  canUpdateRole: boolean;
  member: TeamMember;
  onChanged: () => void;
  teamId: string;
  userId: string;
}) {
  const remove = useMutation({
    mutationFn: () => removeTeamMember(userId, teamId, member.user_id),
    onSuccess: onChanged,
  });
  const updateRole = useMutation({
    mutationFn: (role: Exclude<TeamRole, "owner">) =>
      updateTeamMemberRole(userId, teamId, member.user_id, role),
    onSuccess: onChanged,
  });
  const assignableRole = isAssignableTeamRole(member.role)
    ? member.role
    : undefined;
  const canChangeRole = canUpdateRole && Boolean(assignableRole);

  return (
    <article className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_190px_92px] sm:items-center">
      <div className="min-w-0">
        <TruncatedText className="text-sm font-medium">
          {member.email ?? member.user_id}
        </TruncatedText>
        <MonoId tooltip={member.user_id}>{compactId(member.user_id)}</MonoId>
      </div>
      {canChangeRole ? (
        <RoleSegment
          disabled={updateRole.isPending}
          onChange={(role) => updateRole.mutate(role)}
          value={assignableRole ?? "member"}
        />
      ) : (
        <Badge className="w-full max-w-full justify-center">
          {displayTeamRole(member.role)}
        </Badge>
      )}
      <Button
        disabled={!canRemove || remove.isPending}
        onClick={() => remove.mutate()}
        size="sm"
        tooltip={
          canRemove
            ? "Remove member"
            : "Only owners can remove non-owner members"
        }
        type="button"
        variant="danger"
      >
        Remove
      </Button>
      {updateRole.error && <InlineError error={updateRole.error} />}
    </article>
  );
}

function RoleSegment({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (role: Exclude<TeamRole, "owner">) => void;
  value: Exclude<TeamRole, "owner">;
}) {
  const roles: Array<{
    label: string;
    value: Exclude<TeamRole, "owner">;
  }> = [
    { label: "Member", value: "member" },
    { label: "Operator", value: "operator" },
  ];

  return (
    <div className="inline-flex min-h-8 w-full min-w-[176px] overflow-hidden rounded-md border border-hairline bg-canvas">
      {roles.map((role) => {
        const selected = value === role.value;

        return (
          <button
            aria-label={`Set role to ${role.label}`}
            className={`min-w-[88px] flex-1 px-3 text-xs font-medium transition ${
              selected
                ? "bg-surface-3 text-ink"
                : "text-ink-muted hover:bg-surface-2 hover:text-ink"
            }`}
            disabled={disabled || selected}
            key={role.value}
            onClick={() => onChange(role.value)}
            type="button"
          >
            {role.label}
          </button>
        );
      })}
    </div>
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
    <form
      className="grid w-full gap-2 rounded-lg border border-hairline bg-surface-1 p-3 xl:w-auto xl:min-w-[420px]"
      onSubmit={submit}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bot className="h-4 w-4 text-ink-tertiary" />
        Add agent
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
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
          {availableAgents.length === 0 && (
            <option value="">No available agents</option>
          )}
        </select>
        <Button
          disabled={add.isPending || !selectedAgentId}
          icon={<Bot className="h-4 w-4" />}
          type="submit"
          variant="primary"
        >
          Add
        </Button>
      </div>
      {add.error && <InlineError error={add.error} />}
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
  const agent = teamAgent.agent;
  const ownerLabel =
    teamAgent.agent_owner_email || compactId(teamAgent.agent_owner_user_id);
  const agentMeta = [
    agent?.agent_type,
    agent?.machine_type,
    agent?.os,
    agent?.status,
  ].filter(Boolean);

  return (
    <article className="grid gap-2 rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <TruncatedText className="text-sm font-medium">
          {agent ? agentDisplayName(agent) : teamAgent.agent_id}
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
      <TruncatedText className="text-xs text-ink-tertiary">
        owner {ownerLabel}
      </TruncatedText>
      {agentMeta.length > 0 && (
        <TruncatedText className="text-xs text-ink-tertiary">
          {agentMeta.join(" / ")}
        </TruncatedText>
      )}
      {remove.error && <InlineError error={remove.error} />}
    </article>
  );
}

function AuditEventRow({ event }: { event: TeamAuditEvent }) {
  const target = auditEventTarget(event);
  const metadata = auditEventMetadata(event);

  return (
    <article className="grid gap-2 rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <UserCog className="h-4 w-4 shrink-0 text-ink-tertiary" />
          <TruncatedText className="text-sm font-medium">
            {auditActionLabel(event.action)}
          </TruncatedText>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs text-ink-tertiary">
          <Clock3 className="h-3.5 w-3.5" />
          {compactAuditTime(event.created_at)}
        </div>
      </div>
      <MonoId tooltip={event.actor_user_id}>
        actor {compactId(event.actor_user_id)}
      </MonoId>
      {target && (
        <TruncatedText className="text-xs text-ink-tertiary">
          {target}
        </TruncatedText>
      )}
      {metadata && (
        <TruncatedText className="text-xs text-ink-tertiary">
          {metadata}
        </TruncatedText>
      )}
    </article>
  );
}

function SectionTitle({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <TruncatedText className="text-sm font-medium">{title}</TruncatedText>
      <Badge className="min-w-[1.75rem] justify-center font-mono">
        {String(count)}
      </Badge>
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

function teamRole(team: TeamSummary) {
  return team.my_role ?? team.role ?? "member";
}

function displayTeamRole(role?: string) {
  switch (role) {
    case "owner":
      return "Owner";
    case "operator":
      return "Operator";
    case "member":
      return "Member";
    default:
      return role ?? "Member";
  }
}

function isAssignableTeamRole(
  role: string,
): role is Exclude<TeamRole, "owner"> {
  return role === "member" || role === "operator";
}

function auditActionLabel(action: string) {
  switch (action) {
    case "team.created":
      return "Team created";
    case "team.archived":
      return "Team archived";
    case "invite.created":
      return "Invite created";
    case "invite.accepted":
      return "Invite accepted";
    case "invite.declined":
      return "Invite declined";
    case "invite.canceled":
      return "Invite canceled";
    case "member.role_updated":
      return "Member role updated";
    case "member.removed":
      return "Member removed";
    case "agent.added":
      return "Agent added";
    case "agent.removed":
      return "Agent removed";
    default:
      return action;
  }
}

function auditEventTarget(event: TeamAuditEvent) {
  if (event.target_user_id) {
    return `user ${compactId(event.target_user_id)}`;
  }
  if (event.target_agent_id) {
    return `agent ${compactId(event.target_agent_id)}`;
  }
  if (event.target_invite_id) {
    return `invite ${compactId(event.target_invite_id)}`;
  }
  return "";
}

function auditEventMetadata(event: TeamAuditEvent) {
  const previousRole = event.metadata?.previous_role;
  const role = event.metadata?.role;
  if (typeof previousRole === "string" && typeof role === "string") {
    return `${displayTeamRole(previousRole)} -> ${displayTeamRole(role)}`;
  }
  return "";
}

function compactDate(value?: string) {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function compactAuditTime(value?: string) {
  if (!value) {
    return "now";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
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
