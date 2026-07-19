"use client";

import { useState } from "react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { AuthGate } from "@/features/auth/auth-gate";
import {
  useTeamAgents,
  useTeamAuditEvents,
  useTeamInvites,
  useTeamMembers,
  useTeams,
} from "@/features/api/resources";
import { User } from "@/features/api/types";
import { TeamDetail } from "./team-detail";
import { TeamListPanel } from "./team-list-panel";

export function TeamsPageRoute() {
  return <AuthGate>{(user) => <TeamsPageClient user={user} />}</AuthGate>;
}

export function TeamsPageClient({ user }: { user: User }) {
  const teamsQuery = useTeams(user.user_id);
  const teamInvitesQuery = useTeamInvites(user.user_id);
  const teams = teamsQuery.data?.teams ?? [];
  const teamInvites = teamInvitesQuery.data?.invites ?? [];
  const [selectedTeamId, setSelectedTeamId] = useState<string>();
  const selectedTeam =
    teams.find((team) => team.team_id === selectedTeamId) ?? teams[0];
  const membersQuery = useTeamMembers(user.user_id, selectedTeam?.team_id);
  const teamAgentsQuery = useTeamAgents(user.user_id, selectedTeam?.team_id);
  const teamAuditQuery = useTeamAuditEvents(
    user.user_id,
    selectedTeam?.team_id,
  );

  return (
    <ConsoleLayout user={user}>
      <div className="grid min-h-[calc(100vh-var(--topbar-h))] min-w-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-hairline bg-surface-1 lg:border-b-0 lg:border-r">
          <TeamListPanel
            invites={teamInvites}
            invitesLoading={teamInvitesQuery.isLoading}
            isLoading={teamsQuery.isLoading}
            onSelect={setSelectedTeamId}
            selectedTeamId={selectedTeam?.team_id}
            teams={teams}
            userId={user.user_id}
          />
        </aside>
        <section className="min-w-0 bg-canvas">
          <div className="grid min-w-0 gap-5 p-5">
            <TeamDetail
              auditEvents={teamAuditQuery.data?.events ?? []}
              auditLoading={teamAuditQuery.isLoading}
              isLoading={teamsQuery.isLoading}
              members={membersQuery.data?.members ?? []}
              membersLoading={membersQuery.isLoading}
              team={selectedTeam}
              teamAgents={teamAgentsQuery.data?.agents ?? []}
              teamAgentsLoading={teamAgentsQuery.isLoading}
              userId={user.user_id}
            />
          </div>
        </section>
      </div>
    </ConsoleLayout>
  );
}
