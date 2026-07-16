export const queryKeys = {
  health: () => ["health"] as const,
  me: () => ["me"] as const,
  whiteboardCatalog: () => ["whiteboard", "catalog"] as const,
  user: (userId: string) => ["users", userId] as const,
  apiKeys: (userId: string) => ["users", userId, "api-keys"] as const,
  envelopes: (userId: string, filters?: Record<string, string | undefined>) =>
    ["users", userId, "envelopes", filters ?? {}] as const,
  envelope: (userId: string, envelopeId: string) =>
    ["users", userId, "envelopes", envelopeId] as const,
  friends: (userId: string, filters?: Record<string, string | undefined>) =>
    ["users", userId, "friends", filters ?? {}] as const,
  knowledgeCapsules: (
    userId: string,
    filters?: Record<string, string | undefined>,
  ) => ["users", userId, "knowledge-capsules", filters ?? {}] as const,
  knowledgeCapsule: (userId: string, capsuleId: string) =>
    ["users", userId, "knowledge-capsules", capsuleId] as const,
  sessionKnowledgeInjections: (userId: string, sessionId: string) =>
    ["users", userId, "sessions", sessionId, "knowledge-injections"] as const,
  sessionArtifacts: (userId: string, sessionId: string) =>
    ["users", userId, "sessions", sessionId, "artifacts"] as const,
  artifact: (userId: string, artifactId: string) =>
    ["users", userId, "artifacts", artifactId] as const,
  artifactPublication: (userId: string, publicationId: string) =>
    ["users", userId, "artifact-publications", publicationId] as const,
  teams: (userId: string) => ["users", userId, "teams"] as const,
  team: (userId: string, teamId: string) =>
    ["users", userId, "teams", teamId] as const,
  teamAgents: (userId: string, teamId: string) =>
    ["users", userId, "teams", teamId, "agents"] as const,
  teamAudit: (userId: string, teamId: string, limit?: number) =>
    ["users", userId, "teams", teamId, "audit", limit ?? "default"] as const,
  teamInvites: (userId: string) => ["users", userId, "team-invites"] as const,
  teamMembers: (userId: string, teamId: string) =>
    ["users", userId, "teams", teamId, "members"] as const,
  projectsRoot: (userId: string) => ["users", userId, "projects"] as const,
  projects: (userId: string, includeArchived = false) =>
    ["users", userId, "projects", "list", { includeArchived }] as const,
  project: (userId: string, projectId: string) =>
    ["users", userId, "projects", projectId] as const,
  projectTargets: (userId: string, projectId: string) =>
    ["users", userId, "projects", projectId, "targets"] as const,
  projectTarget: (userId: string, projectId: string, targetId: string) =>
    ["users", userId, "projects", projectId, "targets", targetId] as const,
  approvals: (userId: string) => ["users", userId, "approvals"] as const,
  approvalGrants: (userId: string) =>
    ["users", userId, "approval-grants"] as const,
  nodes: (userId: string) => ["users", userId, "nodes"] as const,
  node: (userId: string, nodeId: string) =>
    ["users", userId, "nodes", nodeId] as const,
  nodeDaemonStatus: (userId: string, nodeId: string) =>
    ["users", userId, "nodes", nodeId, "daemon", "status"] as const,
  nodeDaemonHarnesses: (userId: string, nodeId: string) =>
    ["users", userId, "nodes", nodeId, "daemon", "harnesses"] as const,
  nodeDaemonAgentConnections: (userId: string, nodeId: string) =>
    ["users", userId, "nodes", nodeId, "daemon", "agent-connections"] as const,
  nodeDaemonCommand: (userId: string, nodeId: string, commandId: string) =>
    [
      "users",
      userId,
      "nodes",
      nodeId,
      "daemon",
      "commands",
      commandId,
    ] as const,
  agents: (userId: string, nodeId: string) =>
    ["users", userId, "nodes", nodeId, "agents"] as const,
  userAgents: (userId: string, scope: "accessible" | "owned" = "accessible") =>
    ["users", userId, "agents", scope] as const,
  representativeAgents: (userId: string, runtimeAgentId?: string) =>
    [
      "users",
      userId,
      "representative-agents",
      runtimeAgentId ?? "all",
    ] as const,
  conversationMessages: (userId: string, conversationId: string) =>
    ["users", userId, "conversations", conversationId, "messages"] as const,
  agentOwnerInfos: (userId: string, lookupKeys: string[]) =>
    ["users", userId, "agent-owner-info", [...lookupKeys].sort()] as const,
  agent: (userId: string, nodeId: string, agentId: string) =>
    ["users", userId, "nodes", nodeId, "agents", agentId] as const,
  userAgent: (userId: string, agentId: string) =>
    ["users", userId, "agents", agentId] as const,
  userSessions: (
    userId: string,
    filters?: {
      agentIds?: string[];
      nodeIds?: string[];
      pageSize?: number;
      primaryProjectId?: string;
    },
  ) =>
    [
      "users",
      userId,
      "session-list",
      {
        agentIds: [...(filters?.agentIds ?? [])].sort(),
        nodeIds: [...(filters?.nodeIds ?? [])].sort(),
        pageSize: filters?.pageSize ?? "default",
        primaryProjectId: filters?.primaryProjectId ?? "all",
      },
    ] as const,
  userSessionsRoot: (userId: string) =>
    ["users", userId, "session-list"] as const,
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
  sessionHistory: (userId: string, sessionId: string) =>
    ["users", userId, "sessions", sessionId, "history"] as const,
  sessionMetadata: (userId: string, sessionId: string) =>
    ["users", userId, "sessions", sessionId, "metadata"] as const,
  queuedSessionTurn: (userId: string, agentId: string, sessionId: string) =>
    [
      "users",
      userId,
      "agents",
      agentId,
      "sessions",
      sessionId,
      "queued-turn",
    ] as const,
};
