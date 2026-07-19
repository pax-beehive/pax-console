"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Archive, MailPlus, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { useTeamInvalidation } from "@/features/api/invalidation";
import { archiveTeam, leaveTeam } from "@/features/api/resources";
import {
  TeamAgent,
  TeamAuditEvent,
  TeamMember,
  TeamSummary,
} from "@/features/api/types";
import { compactDate, compactId } from "@/lib/format";
import { AddAgentControl, TeamAgentsSection } from "./team-agents-section";
import { TeamAuditSection } from "./team-audit-section";
import { displayTeamRole, teamRole, teamRoleBadgeTone } from "./team-format";
import { InviteMemberForm, TeamMembersSection } from "./team-members-section";

type TeamDetailTab = "members" | "agents" | "audit";

export function TeamDetail({
  auditEvents,
  auditLoading,
  isLoading,
  members,
  membersLoading,
  team,
  teamAgents,
  teamAgentsLoading,
  userId,
}: {
  auditEvents: TeamAuditEvent[];
  auditLoading: boolean;
  isLoading: boolean;
  members: TeamMember[];
  membersLoading: boolean;
  team?: TeamSummary;
  teamAgents: TeamAgent[];
  teamAgentsLoading: boolean;
  userId: string;
}) {
  const [activeTab, setActiveTab] = useState<TeamDetailTab>("members");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "archive" | "leave" | null
  >(null);
  const invalidateTeams = useTeamInvalidation(userId);
  const role = team ? teamRole(team) : undefined;
  const isOwner = role === "owner";
  const canManageOwnAgents = role === "owner" || role === "operator";
  const archive = useMutation({
    mutationFn: () => archiveTeam(userId, team?.team_id ?? ""),
    onSuccess: () => {
      setConfirmAction(null);
      invalidateTeams();
    },
  });
  const leave = useMutation({
    mutationFn: () => leaveTeam(userId, team?.team_id ?? ""),
    onSuccess: () => {
      setConfirmAction(null);
      invalidateTeams();
    },
  });

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
          <div className="flex items-center gap-2 text-xs text-accent-bright">
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
          <Badge tone={teamRoleBadgeTone(role)}>{displayTeamRole(role)}</Badge>
          {isOwner && (
            <Button
              icon={<MailPlus className="h-4 w-4" />}
              onClick={() => setInviteOpen((open) => !open)}
              size="sm"
              type="button"
              variant={inviteOpen ? "primary" : "secondary"}
            >
              Invite
            </Button>
          )}
          {isOwner && (
            <Button
              disabled={archive.isPending}
              icon={<Archive className="h-4 w-4" />}
              onClick={() => setConfirmAction("archive")}
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
              onClick={() => setConfirmAction("leave")}
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

      {inviteOpen && isOwner && (
        <InviteMemberForm
          onClose={() => setInviteOpen(false)}
          teamId={team.team_id}
          userId={userId}
        />
      )}

      <TeamOverview team={team} role={role ?? "member"} />

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <TeamDetailTabs
          activeTab={activeTab}
          auditCount={auditEvents.length}
          memberCount={members.length}
          onChange={setActiveTab}
          teamAgentCount={teamAgents.length}
        />
        {activeTab === "agents" && canManageOwnAgents && (
          <AddAgentControl
            teamAgents={teamAgents}
            teamId={team.team_id}
            userId={userId}
          />
        )}
      </div>

      {activeTab === "members" && (
        <TeamMembersSection
          isLoading={membersLoading}
          isOwner={isOwner}
          members={members}
          teamId={team.team_id}
          userId={userId}
        />
      )}

      {activeTab === "agents" && (
        <TeamAgentsSection
          isLoading={teamAgentsLoading}
          isOwner={isOwner}
          teamAgents={teamAgents}
          teamId={team.team_id}
          userId={userId}
        />
      )}

      {activeTab === "audit" && (
        <TeamAuditSection events={auditEvents} isLoading={auditLoading} />
      )}

      <ConfirmDialog
        confirmLabel={archive.isPending ? "Archiving..." : "Archive team"}
        description={
          <>
            This archives{" "}
            <span className="font-medium text-ink">{team.name}</span> for all
            members.
          </>
        }
        disabled={archive.isPending}
        onConfirm={() => archive.mutate()}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
        open={confirmAction === "archive"}
        title="Archive team?"
      />
      <ConfirmDialog
        confirmLabel={leave.isPending ? "Leaving..." : "Leave team"}
        description={
          <>
            You will no longer have access to{" "}
            <span className="font-medium text-ink">{team.name}</span>.
          </>
        }
        disabled={leave.isPending}
        onConfirm={() => leave.mutate()}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
          }
        }}
        open={confirmAction === "leave"}
        title="Leave team?"
      />
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
                ? "bg-accent/15 text-accent-bright"
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
