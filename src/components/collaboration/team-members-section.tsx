"use client";

import { FormEvent, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MailPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { useTeamInvalidation } from "@/features/api/invalidation";
import {
  createTeamInvite,
  removeTeamMember,
  updateTeamMemberRole,
} from "@/features/api/resources";
import { TeamMember, TeamRole } from "@/features/api/types";
import { compactId } from "@/lib/format";
import {
  displayTeamRole,
  isAssignableTeamRole,
  teamRoleBadgeTone,
} from "./team-format";

export function TeamMembersSection({
  isLoading,
  isOwner,
  members,
  teamId,
  userId,
}: {
  isLoading: boolean;
  isOwner: boolean;
  members: TeamMember[];
  teamId: string;
  userId: string;
}) {
  return (
    <section className="grid gap-3">
      {isLoading && <EmptyState label="Loading members" />}
      <div className="grid overflow-hidden rounded-lg border border-hairline">
        {members.map((member) => (
          <MemberRow
            canManage={isOwner && member.role !== "owner"}
            key={member.user_id}
            member={member}
            teamId={teamId}
            userId={userId}
          />
        ))}
        {!isLoading && members.length === 0 && (
          <EmptyState label="No active members" />
        )}
      </div>
    </section>
  );
}

export function InviteMemberForm({
  onClose,
  teamId,
  userId,
}: {
  onClose: () => void;
  teamId: string;
  userId: string;
}) {
  const invalidateTeams = useTeamInvalidation(userId);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<TeamRole, "owner">>("member");
  const invite = useMutation({
    mutationFn: () => createTeamInvite(userId, teamId, email.trim(), role),
    onSuccess: () => {
      setEmail("");
      setRole("member");
      invalidateTeams();
      onClose();
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
      className="grid gap-2 rounded-lg border border-hairline bg-surface-1 p-3"
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
  canManage,
  member,
  teamId,
  userId,
}: {
  canManage: boolean;
  member: TeamMember;
  teamId: string;
  userId: string;
}) {
  const invalidateTeams = useTeamInvalidation(userId);
  const remove = useMutation({
    mutationFn: () => removeTeamMember(userId, teamId, member.user_id),
    onSuccess: invalidateTeams,
  });
  const updateRole = useMutation({
    mutationFn: (role: Exclude<TeamRole, "owner">) =>
      updateTeamMemberRole(userId, teamId, member.user_id, role),
    onSuccess: invalidateTeams,
  });
  const assignableRole = isAssignableTeamRole(member.role)
    ? member.role
    : undefined;
  const canChangeRole = canManage && Boolean(assignableRole);

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
        <Badge
          className="w-full max-w-full justify-center"
          tone={teamRoleBadgeTone(member.role)}
        >
          {displayTeamRole(member.role)}
        </Badge>
      )}
      <Button
        disabled={!canManage || remove.isPending}
        onClick={() => remove.mutate()}
        size="sm"
        tooltip={
          canManage
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
