import type { Agent, LoginHarness } from "@/features/api/types";

// Older links and Manager versions used the native CLI name for Claude Code.
const legacyAgentTypes: Record<string, LoginHarness> = {
  claude: "claude-code",
};

/** PAX agent type for an id from a URL or agent record; legacy names map forward. */
export function normalizeAgentType(value?: string | null) {
  const id = value?.trim().toLowerCase();
  if (!id) return undefined;
  return legacyAgentTypes[id] ?? id;
}

/** Fallback display name for an agent type, such as "claude-code" -> "Claude Code". */
export function agentTypeLabel(id: string) {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Distinct agent types of agents registered in PAX for one device. This only
 * reads Manager records; it never probes the device for installed tools.
 */
export function registeredAgentTypes(agents: Agent[], nodeId: string) {
  const types = new Set<LoginHarness>();
  for (const agent of agents) {
    if (agent.node_id && agent.node_id !== nodeId) continue;
    const type = normalizeAgentType(agent.agent_type);
    if (type) types.add(type);
  }
  return [...types].sort((a, b) =>
    agentTypeLabel(a).localeCompare(agentTypeLabel(b)),
  );
}
