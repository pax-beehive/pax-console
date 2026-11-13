"use client";
import { useI18n, type Translator } from "@/features/i18n/use-i18n";

import { Clock3, UserCog } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { TeamAuditEvent } from "@/features/api/types";
import { compactDateTime, compactId } from "@/lib/format";
import { displayTeamRole } from "./team-format";

export function TeamAuditSection({
  events,
  isLoading,
}: {
  events: TeamAuditEvent[];
  isLoading: boolean;
}) {
  const { t } = useI18n();
  return (
    <section className="grid gap-3">
      {isLoading && <EmptyState label={t("Loading audit events")} />}
      <div className="grid overflow-hidden rounded-lg border border-hairline">
        {events.map((event) => (
          <AuditEventRow event={event} key={event.event_id} />
        ))}
        {!isLoading && events.length === 0 && (
          <EmptyState label={t("No audit events")} />
        )}
      </div>
    </section>
  );
}

function AuditEventRow({ event }: { event: TeamAuditEvent }) {
  const { t } = useI18n();
  const target = auditEventTarget(event);
  const metadata = auditEventMetadata(event, t);

  return (
    <article className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <UserCog className="h-4 w-4 shrink-0 text-ink-tertiary" />
        <TruncatedText className="text-sm font-medium">
          {auditActionLabel(event.action, t)}
        </TruncatedText>
      </div>
      <div className="min-w-0">
        <MonoId tooltip={event.actor_user_id}>
          {t("actor")} {compactId(event.actor_user_id)}
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
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs text-ink-tertiary sm:justify-end">
        <Clock3 className="h-3.5 w-3.5" />
        {compactDateTime(event.created_at)}
      </div>
    </article>
  );
}

function auditActionLabel(action: string, t: Translator) {
  switch (action) {
    case "team.created":
      return t("Team created");
    case "team.archived":
      return t("Team archived");
    case "invite.created":
      return t("Invite created");
    case "invite.accepted":
      return t("Invite accepted");
    case "invite.declined":
      return t("Invite declined");
    case "invite.canceled":
      return t("Invite canceled");
    case "member.role_updated":
      return t("Member role updated");
    case "member.removed":
      return t("Member removed");
    case "agent.added":
      return t("Agent added");
    case "agent.removed":
      return t("Agent removed");
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

function auditEventMetadata(event: TeamAuditEvent, t: Translator) {
  const previousRole = event.metadata?.previous_role;
  const role = event.metadata?.role;
  if (typeof previousRole === "string" && typeof role === "string") {
    return `${displayTeamRole(previousRole, t)} -> ${displayTeamRole(role, t)}`;
  }
  return "";
}
