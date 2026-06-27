"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch, userPath } from "./client";
import { ApiError } from "./errors";
import { queryKeys } from "./query-keys";
import {
  Agent,
  AgentApproval,
  AgentSession,
  ApprovedNodeRegistration,
  ApprovedPaxlDeviceLogin,
  CreatedNodeRegistrationToken,
  CreatedUserAPIKey,
  Envelope,
  Friend,
  Health,
  HistoryMessage,
  KnowledgeCapsule,
  MailboxMessage,
  Node,
  NodeRegistrationPreview,
  PaxdConnectPreview,
  SessionKnowledgeInjection,
  Team,
  TeamAgent,
  TeamInvite,
  TeamMember,
  TeamSummary,
  TeamRole,
  UserAPIKey,
} from "./types";

type NodeListData = {
  nodes: Node[];
};

type AgentListData = {
  agents: Agent[];
};

type SessionListData = {
  sessions: AgentSession[];
};

type MailboxListData = {
  messages: MailboxMessage[];
};

type HistoryListData = {
  messages: HistoryMessage[];
};

type ApiKeyListData = {
  api_keys: UserAPIKey[];
};

type ApprovalListData = {
  approvals: AgentApproval[];
};

type ApprovalGrantListData = {
  grants: AgentApproval[];
};

type TeamListData = {
  teams: TeamSummary[];
};

type TeamData = {
  team: Team;
};

type TeamMemberListData = {
  members: TeamMember[];
};

type TeamInviteListData = {
  invites: TeamInvite[];
};

type TeamAgentListData = {
  agents: TeamAgent[];
};

type FriendListData = {
  friends: Friend[];
};

type EnvelopeListData = {
  envelopes: Envelope[];
};

type KnowledgeCapsuleListData = {
  capsules: KnowledgeCapsule[];
};

type KnowledgeInjectionListData = {
  injections: SessionKnowledgeInjection[];
};

export function getHealth() {
  return apiFetch<Health>("/api/v1/health");
}

export function listNodes(userId: string) {
  return apiFetch<NodeListData>(userPath(userId, "/nodes"));
}

export function getNode(userId: string, nodeId: string) {
  return apiFetch<Node>(userPath(userId, `/nodes/${nodeId}`));
}

export function listNodeAgents(userId: string, nodeId: string) {
  return apiFetch<AgentListData>(userPath(userId, `/nodes/${nodeId}/agents`));
}

export function getNodeAgent(userId: string, nodeId: string, agentId: string) {
  return apiFetch<Agent>(
    userPath(userId, `/nodes/${nodeId}/agents/${agentId}`),
  );
}

export async function listAgentSessions(
  userId: string,
  nodeId: string,
  agentId: string,
): Promise<SessionListData> {
  try {
    return await apiFetch<SessionListData>(
      userPath(userId, `/nodes/${nodeId}/agents/${agentId}/sessions`),
    );
  } catch (error) {
    // A missing sessions collection just means there are no sessions yet;
    // treat 404 as an empty list instead of surfacing an error.
    if (error instanceof ApiError && error.status === 404) {
      return { sessions: [] };
    }
    throw error;
  }
}

export function listSessionMessages(
  userId: string,
  nodeId: string,
  agentId: string,
  sessionId: string,
) {
  return apiFetch<MailboxListData>(
    userPath(
      userId,
      `/nodes/${nodeId}/agents/${agentId}/sessions/${sessionId}/messages`,
    ),
  );
}

export function listSessionHistory(
  userId: string,
  agentId: string,
  sessionId: string,
  limit = 1000,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<HistoryListData>(
    `${userPath(userId, `/agents/${agentId}/sessions/${sessionId}/history`)}?${params}`,
  );
}

export function listApiKeys(userId: string) {
  return apiFetch<ApiKeyListData>(userPath(userId, "/api-keys"));
}

export function createApiKey(userId: string, name: string) {
  return apiFetch<CreatedUserAPIKey>(userPath(userId, "/api-keys"), {
    body: JSON.stringify({ name, user_id: userId }),
    method: "POST",
  });
}

export function deleteApiKey(userId: string, keyId: string) {
  return apiFetch<Record<string, never>>(
    userPath(userId, `/api-keys/${keyId}`),
    { method: "DELETE" },
  );
}

export function createNodeRegistrationToken(
  userId: string,
  expiresInSeconds: number,
) {
  return apiFetch<CreatedNodeRegistrationToken>(
    userPath(userId, "/node-registration-tokens"),
    {
      body: JSON.stringify({
        expires_in_seconds: expiresInSeconds,
        owner_user_id: userId,
        user_id: userId,
      }),
      method: "POST",
    },
  );
}

export function approveNodeRegistration(userId: string, pairCode: string) {
  return apiFetch<ApprovedNodeRegistration>(
    userPath(userId, `/node-registrations/${pairCode}/approve`),
    { method: "POST" },
  );
}

export function approvePaxlDeviceLogin(userId: string, userCode: string) {
  return apiFetch<ApprovedPaxlDeviceLogin>(
    userPath(userId, `/paxl/device-logins/${userCode}/approve`),
    { method: "POST" },
  );
}

export function getNodeRegistration(userId: string, pairCode: string) {
  return apiFetch<NodeRegistrationPreview>(
    userPath(userId, `/node-registrations/${pairCode}`),
  );
}

export function toPaxdConnectPreview(
  registration: NodeRegistrationPreview,
): PaxdConnectPreview {
  return {
    apiEndpoint: registration.request?.api_endpoint,
    arch: registration.request?.arch,
    city: registration.network?.city,
    country: registration.network?.country,
    hostname: registration.request?.hostname,
    ipAddress: registration.network?.ip_address,
    machineType: registration.request?.machine_type,
    os: registration.request?.os,
    paxdVersion: registration.request?.paxd_version,
    requestedAt: registration.created_at,
  };
}

export function listApprovals(userId: string) {
  return apiFetch<ApprovalListData>(userPath(userId, "/approvals"));
}

export function listApprovalGrants(userId: string) {
  return apiFetch<ApprovalGrantListData>(userPath(userId, "/approval-grants"));
}

export function decideApproval(
  userId: string,
  approvalId: string,
  decisionOption: string,
) {
  return apiFetch<{ approval: AgentApproval }>(
    userPath(userId, `/approvals/${approvalId}/decision`),
    {
      body: JSON.stringify({
        approval_id: approvalId,
        decision_option: decisionOption,
        user_id: userId,
      }),
      method: "POST",
    },
  );
}

export function revokeApprovalGrant(
  userId: string,
  grantId: string,
  reason = "revoked from PAX Console",
) {
  return apiFetch<{ approval: AgentApproval }>(
    userPath(userId, `/approval-grants/${grantId}/revoke`),
    {
      body: JSON.stringify({ grant_id: grantId, reason, user_id: userId }),
      method: "POST",
    },
  );
}

export function createAgentSession(
  userId: string,
  nodeId: string,
  agentId: string,
  name = "Console session",
) {
  return apiFetch<AgentSession>(
    userPath(userId, `/nodes/${nodeId}/agents/${agentId}/sessions`),
    {
      body: JSON.stringify({
        agent_id: agentId,
        name,
        node_id: nodeId,
        source: "console",
        user_id: userId,
      }),
      method: "POST",
    },
  );
}

export function listTeams(userId: string) {
  return apiFetch<TeamListData>(userPath(userId, "/teams"));
}

export function createTeam(userId: string, name: string) {
  return apiFetch<TeamData>(userPath(userId, "/teams"), {
    body: JSON.stringify({ name }),
    method: "POST",
  });
}

export function getTeam(userId: string, teamId: string) {
  return apiFetch<TeamData>(userPath(userId, `/teams/${teamId}`));
}

export function listTeamMembers(userId: string, teamId: string) {
  return apiFetch<TeamMemberListData>(
    userPath(userId, `/teams/${teamId}/members`),
  );
}

export function removeTeamMember(
  userId: string,
  teamId: string,
  memberUserId: string,
) {
  return apiFetch<{ member: TeamMember }>(
    userPath(userId, `/teams/${teamId}/members/${memberUserId}`),
    { method: "DELETE" },
  );
}

export function leaveTeam(userId: string, teamId: string) {
  return apiFetch<{ member: TeamMember }>(
    userPath(userId, `/teams/${teamId}/leave`),
    { method: "POST" },
  );
}

export function createTeamInvite(
  userId: string,
  teamId: string,
  email: string,
  role: Exclude<TeamRole, "owner"> = "member",
) {
  return apiFetch<{ invite: TeamInvite }>(
    userPath(userId, `/teams/${teamId}/invites`),
    {
      body: JSON.stringify({ email, role }),
      method: "POST",
    },
  );
}

export function listTeamInvites(userId: string) {
  return apiFetch<TeamInviteListData>(userPath(userId, "/team-invites"));
}

export function acceptTeamInvite(userId: string, inviteId: string) {
  return apiFetch<{ invite: TeamInvite }>(
    userPath(userId, `/team-invites/${inviteId}/accept`),
    { method: "POST" },
  );
}

export function declineTeamInvite(userId: string, inviteId: string) {
  return apiFetch<{ invite: TeamInvite }>(
    userPath(userId, `/team-invites/${inviteId}/decline`),
    { method: "POST" },
  );
}

export function listTeamAgents(userId: string, teamId: string) {
  return apiFetch<TeamAgentListData>(
    userPath(userId, `/teams/${teamId}/agents`),
  );
}

export function addTeamAgent(userId: string, teamId: string, agentId: string) {
  return apiFetch<{ agent: TeamAgent }>(
    userPath(userId, `/teams/${teamId}/agents`),
    {
      body: JSON.stringify({ agent_id: agentId }),
      method: "POST",
    },
  );
}

export function removeTeamAgent(
  userId: string,
  teamId: string,
  agentId: string,
) {
  return apiFetch<{ agent: TeamAgent }>(
    userPath(userId, `/teams/${teamId}/agents/${agentId}`),
    { method: "DELETE" },
  );
}

export function listFriends(
  userId: string,
  filters: { alias?: string; direction?: string; status?: string } = {},
) {
  const params = compactSearchParams(filters);
  return apiFetch<FriendListData>(
    `${userPath(userId, "/friends")}${params ? `?${params}` : ""}`,
  );
}

export function createFriend(userId: string, email: string, alias?: string) {
  return apiFetch<{ friend: Friend }>(userPath(userId, "/friends"), {
    body: JSON.stringify({ alias, email }),
    method: "POST",
  });
}

export function acceptFriend(userId: string, friendId: string, alias?: string) {
  return apiFetch<{ friend: Friend }>(
    userPath(userId, `/friends/${friendId}/accept`),
    {
      body: JSON.stringify({ alias }),
      method: "POST",
    },
  );
}

export function updateFriendAlias(
  userId: string,
  friendId: string,
  alias: string,
) {
  return apiFetch<{ friend: Friend }>(
    userPath(userId, `/friends/${friendId}/alias`),
    {
      body: JSON.stringify({ alias }),
      method: "POST",
    },
  );
}

export function removeFriend(userId: string, friendId: string) {
  return apiFetch<{ friend: Friend }>(
    userPath(userId, `/friends/${friendId}/remove`),
    { method: "POST" },
  );
}

export function blockFriend(userId: string, friendId: string) {
  return apiFetch<{ friend: Friend }>(
    userPath(userId, `/friends/${friendId}/block`),
    { method: "POST" },
  );
}

export function listEnvelopes(
  userId: string,
  filters: { direction?: string; status?: string } = {},
) {
  const params = compactSearchParams(filters);
  return apiFetch<EnvelopeListData>(
    `${userPath(userId, "/envelopes")}${params ? `?${params}` : ""}`,
  );
}

export function createEnvelope(
  userId: string,
  input: {
    message?: string;
    payload_json: unknown;
    payload_type?: "knowledge_capsule";
    recipient_email: string;
  },
) {
  return apiFetch<{ envelope: Envelope }>(userPath(userId, "/envelopes"), {
    body: JSON.stringify({
      message: input.message,
      payload_json: input.payload_json,
      payload_type: input.payload_type ?? "knowledge_capsule",
      recipient_email: input.recipient_email,
    }),
    method: "POST",
  });
}

export function acceptEnvelope(userId: string, envelopeId: string) {
  return apiFetch<{ envelope: Envelope }>(
    userPath(userId, `/envelopes/${envelopeId}/accept`),
    { method: "POST" },
  );
}

export function archiveEnvelope(userId: string, envelopeId: string) {
  return apiFetch<{ envelope: Envelope }>(
    userPath(userId, `/envelopes/${envelopeId}/archive`),
    { method: "POST" },
  );
}

export function listKnowledgeCapsules(
  userId: string,
  filters: {
    keyword?: string;
    source_session_id?: string;
    status?: string;
  } = {},
) {
  const params = compactSearchParams(filters);
  return apiFetch<KnowledgeCapsuleListData>(
    `${userPath(userId, "/knowledge-capsules")}${params ? `?${params}` : ""}`,
  );
}

export function createKnowledgeCapsule(
  userId: string,
  sessionId: string,
  keyword: string,
) {
  return apiFetch<{ capsule: KnowledgeCapsule }>(
    userPath(userId, `/sessions/${sessionId}/knowledge-capsules`),
    {
      body: JSON.stringify({ keyword }),
      method: "POST",
    },
  );
}

export function archiveKnowledgeCapsule(userId: string, capsuleId: string) {
  return apiFetch<{ capsule: KnowledgeCapsule }>(
    userPath(userId, `/knowledge-capsules/${capsuleId}/archive`),
    { method: "POST" },
  );
}

export function injectKnowledgeCapsule(
  userId: string,
  sessionId: string,
  capsuleId: string,
) {
  return apiFetch<{
    injection: SessionKnowledgeInjection;
    message: MailboxMessage;
  }>(userPath(userId, `/sessions/${sessionId}/knowledge-injections`), {
    body: JSON.stringify({ capsule_id: capsuleId }),
    method: "POST",
  });
}

export function listKnowledgeInjections(userId: string, sessionId: string) {
  return apiFetch<KnowledgeInjectionListData>(
    userPath(userId, `/sessions/${sessionId}/knowledge-injections`),
  );
}

export function useNodes(userId?: string) {
  // Hooks in this file are thin TanStack Query wrappers around pax-manager
  // resources. They own caching/loading state; components only compose results.
  return useQuery({
    queryKey: queryKeys.nodes(userId ?? "pending"),
    queryFn: () => listNodes(userId as string),
    enabled: Boolean(userId),
  });
}

export function useHealth(enabled = true) {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: getHealth,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useNode(userId?: string, nodeId?: string) {
  return useQuery({
    queryKey: queryKeys.node(userId ?? "pending", nodeId ?? "pending"),
    queryFn: () => getNode(userId as string, nodeId as string),
    enabled: Boolean(userId && nodeId),
  });
}

export function useApiKeys(userId?: string) {
  return useQuery({
    queryKey: queryKeys.apiKeys(userId ?? "pending"),
    queryFn: () => listApiKeys(userId as string),
    enabled: Boolean(userId),
  });
}

export function useTeams(userId?: string) {
  return useQuery({
    queryKey: queryKeys.teams(userId ?? "pending"),
    queryFn: () => listTeams(userId as string),
    enabled: Boolean(userId),
  });
}

export function useTeam(userId?: string, teamId?: string) {
  return useQuery({
    queryKey: queryKeys.team(userId ?? "pending", teamId ?? "pending"),
    queryFn: () => getTeam(userId as string, teamId as string),
    enabled: Boolean(userId && teamId),
  });
}

export function useTeamMembers(userId?: string, teamId?: string) {
  return useQuery({
    queryKey: queryKeys.teamMembers(userId ?? "pending", teamId ?? "pending"),
    queryFn: () => listTeamMembers(userId as string, teamId as string),
    enabled: Boolean(userId && teamId),
  });
}

export function useTeamAgents(userId?: string, teamId?: string) {
  return useQuery({
    queryKey: queryKeys.teamAgents(userId ?? "pending", teamId ?? "pending"),
    queryFn: () => listTeamAgents(userId as string, teamId as string),
    enabled: Boolean(userId && teamId),
  });
}

export function useTeamInvites(userId?: string) {
  return useQuery({
    queryKey: queryKeys.teamInvites(userId ?? "pending"),
    queryFn: () => listTeamInvites(userId as string),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
  });
}

export function useFriends(
  userId?: string,
  filters: { alias?: string; direction?: string; status?: string } = {},
) {
  return useQuery({
    queryKey: queryKeys.friends(userId ?? "pending", filters),
    queryFn: () => listFriends(userId as string, filters),
    enabled: Boolean(userId),
  });
}

export function useEnvelopes(
  userId?: string,
  filters: { direction?: string; status?: string } = {},
) {
  return useQuery({
    queryKey: queryKeys.envelopes(userId ?? "pending", filters),
    queryFn: () => listEnvelopes(userId as string, filters),
    enabled: Boolean(userId),
    refetchInterval: filters.direction === "received" ? 30_000 : false,
  });
}

export function useKnowledgeCapsules(
  userId?: string,
  filters: {
    keyword?: string;
    source_session_id?: string;
    status?: string;
  } = {},
) {
  return useQuery({
    queryKey: queryKeys.knowledgeCapsules(userId ?? "pending", filters),
    queryFn: () => listKnowledgeCapsules(userId as string, filters),
    enabled: Boolean(userId),
  });
}

export function useApprovals(userId?: string) {
  return useQuery({
    queryKey: queryKeys.approvals(userId ?? "pending"),
    queryFn: () => listApprovals(userId as string),
    enabled: Boolean(userId),
    refetchInterval: 15_000,
  });
}

export function useApprovalGrants(userId?: string) {
  return useQuery({
    queryKey: queryKeys.approvalGrants(userId ?? "pending"),
    queryFn: () => listApprovalGrants(userId as string),
    enabled: Boolean(userId),
  });
}

export function useNodeAgents(userId?: string, nodeId?: string) {
  return useQuery({
    queryKey: queryKeys.agents(userId ?? "pending", nodeId ?? "pending"),
    queryFn: () => listNodeAgents(userId as string, nodeId as string),
    enabled: Boolean(userId && nodeId),
  });
}

export function useNodeAgent(
  userId?: string,
  nodeId?: string,
  agentId?: string,
) {
  return useQuery({
    queryKey: queryKeys.agent(
      userId ?? "pending",
      nodeId ?? "pending",
      agentId ?? "pending",
    ),
    queryFn: () =>
      getNodeAgent(userId as string, nodeId as string, agentId as string),
    enabled: Boolean(userId && nodeId && agentId),
  });
}

export function useAgentSessions(
  userId?: string,
  nodeId?: string,
  agentId?: string,
) {
  return useQuery({
    queryKey: queryKeys.sessions(
      userId ?? "pending",
      nodeId ?? "pending",
      agentId ?? "pending",
    ),
    queryFn: () =>
      listAgentSessions(userId as string, nodeId as string, agentId as string),
    enabled: Boolean(userId && nodeId && agentId),
  });
}

export function useSessionMessages(
  userId?: string,
  nodeId?: string,
  agentId?: string,
  sessionId?: string,
) {
  return useQuery({
    queryKey: queryKeys.sessionMessages(
      userId ?? "pending",
      nodeId ?? "pending",
      agentId ?? "pending",
      sessionId ?? "pending",
    ),
    queryFn: () =>
      listSessionMessages(
        userId as string,
        nodeId as string,
        agentId as string,
        sessionId as string,
      ),
    enabled: Boolean(userId && nodeId && agentId && sessionId),
    refetchOnWindowFocus: true,
  });
}

export function useSessionHistory(
  userId?: string,
  agentId?: string,
  sessionId?: string,
) {
  return useQuery({
    queryKey: queryKeys.sessionHistory(
      userId ?? "pending",
      agentId ?? "pending",
      sessionId ?? "pending",
    ),
    queryFn: () =>
      listSessionHistory(
        userId as string,
        agentId as string,
        sessionId as string,
      ),
    enabled: Boolean(userId && agentId && sessionId),
    refetchOnWindowFocus: true,
  });
}

export function useKnowledgeInjections(userId?: string, sessionId?: string) {
  return useQuery({
    queryKey: queryKeys.sessionKnowledgeInjections(
      userId ?? "pending",
      sessionId ?? "pending",
    ),
    queryFn: () =>
      listKnowledgeInjections(userId as string, sessionId as string),
    enabled: Boolean(userId && sessionId),
    refetchOnWindowFocus: true,
  });
}

function compactSearchParams(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value?.trim()) {
      params.set(key, value.trim());
    }
  });

  return params.toString();
}
