export const queryKeys = {
  health: () => ["health"] as const,
  me: () => ["me"] as const,
  apiKeys: (userId: string) => ["users", userId, "api-keys"] as const,
  approvals: (userId: string) => ["users", userId, "approvals"] as const,
  approvalGrants: (userId: string) =>
    ["users", userId, "approval-grants"] as const,
  nodes: (userId: string) => ["users", userId, "nodes"] as const,
  node: (userId: string, nodeId: string) =>
    ["users", userId, "nodes", nodeId] as const,
  agents: (userId: string, nodeId: string) =>
    ["users", userId, "nodes", nodeId, "agents"] as const,
  agent: (userId: string, nodeId: string, agentId: string) =>
    ["users", userId, "nodes", nodeId, "agents", agentId] as const,
  sessions: (userId: string, nodeId: string, agentId: string) =>
    ["users", userId, "nodes", nodeId, "agents", agentId, "sessions"] as const,
  session: (
    userId: string,
    nodeId: string,
    agentId: string,
    sessionId: string,
  ) =>
    [
      "users",
      userId,
      "nodes",
      nodeId,
      "agents",
      agentId,
      "sessions",
      sessionId,
    ] as const,
  sessionMessages: (
    userId: string,
    nodeId: string,
    agentId: string,
    sessionId: string,
  ) =>
    [
      "users",
      userId,
      "nodes",
      nodeId,
      "agents",
      agentId,
      "sessions",
      sessionId,
      "messages",
    ] as const,
  sessionHistory: (userId: string, agentId: string, sessionId: string) =>
    [
      "users",
      userId,
      "agents",
      agentId,
      "sessions",
      sessionId,
      "history",
    ] as const,
};
