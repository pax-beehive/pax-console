import type { AgentSession } from "@/features/api/types";

export function isInternalSecretarySession(
  session: Pick<AgentSession, "session_id" | "source">,
) {
  return (
    session.source === "secretary_internal" ||
    session.session_id.startsWith("sess_secretary_")
  );
}

export function selectVisibleSessions<T extends { sessions: AgentSession[] }>(
  data: T,
): T {
  return {
    ...data,
    sessions: data.sessions.filter(
      (session) => !isInternalSecretarySession(session),
    ),
  };
}

export type CronSessionOrigin = {
  kind: "cronjob";
  cronjob_id: string;
  run_id: string;
  name: string;
};

export function cronSessionOrigin(
  session?: Pick<AgentSession, "metadata"> | null,
): CronSessionOrigin | undefined {
  const value = session?.metadata?.origin;
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const origin = value as Record<string, unknown>;
  if (
    origin.kind !== "cronjob" ||
    typeof origin.cronjob_id !== "string" ||
    typeof origin.run_id !== "string" ||
    typeof origin.name !== "string" ||
    !origin.cronjob_id ||
    !origin.run_id ||
    !origin.name
  )
    return;
  return {
    kind: "cronjob",
    cronjob_id: origin.cronjob_id,
    run_id: origin.run_id,
    name: origin.name,
  };
}
