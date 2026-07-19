import { Agent, TeamRole, TeamSummary } from "@/features/api/types";

export function teamRole(team: TeamSummary) {
  return team.my_role ?? team.role ?? "member";
}

export function displayTeamRole(role?: string) {
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

export function isAssignableTeamRole(
  role: string,
): role is Exclude<TeamRole, "owner"> {
  return role === "member" || role === "operator";
}

export function teamRoleBadgeTone(role?: string) {
  switch (role) {
    case "owner":
      return "accent" as const;
    case "operator":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

export function agentStatusTone(status?: string) {
  if (status === "online") {
    return "success" as const;
  }
  if (status === "error" || status === "failed") {
    return "danger" as const;
  }
  return "neutral" as const;
}

export function agentDisplayName(agent: Agent) {
  return agent.name ?? agent.hostname ?? agent.agent_id;
}
