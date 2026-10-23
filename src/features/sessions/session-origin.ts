import type { AgentSession } from "@/features/api/types";

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
