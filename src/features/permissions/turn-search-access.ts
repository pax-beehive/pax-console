import type { TurnSearchAccess } from "@/features/api/types";

export function parseTurnSearchAccess(
  queries: string,
  sessions: string,
  agents = "*",
  nodes?: string,
): TurnSearchAccess {
  return {
    queries: parseEntries(queries, "Queries", 256),
    ...(nodes === undefined
      ? {}
      : { node_ids: parseEntries(nodes, "Node IDs", 4096) }),
    agent_ids: parseEntries(agents, "Agent IDs", 4096),
    session_ids: parseEntries(sessions, "Session IDs", 4096),
  };
}

function parseEntries(value: string, label: string, maxLength: number) {
  const entries = [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
  if (!entries.length || entries.length > 50) {
    throw new Error(`${label} must contain * or between 1 and 50 entries.`);
  }
  if (entries.includes("*") && entries.length !== 1) {
    throw new Error(`Use * on its own for ${label.toLowerCase()}.`);
  }
  if (entries.some((entry) => Array.from(entry).length > maxLength)) {
    throw new Error(
      `${label} entries must be at most ${maxLength} characters.`,
    );
  }
  return entries;
}
