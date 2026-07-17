"use client";

import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL, apiFetch, userPath } from "./client";
import { ApiError } from "./errors";
import { queryKeys } from "./query-keys";
import {
  ApiRecord,
  Agent,
  AgentOwnerInfo,
  AgentInquiryResult,
  AgentApproval,
  AgentProfile,
  AgentSession,
  ApprovedNodeRegistration,
  ApprovedPaxlDeviceLogin,
  ArtifactContentURL,
  ArtifactUploadTicket,
  CompleteArtifactUploadData,
  CreatedNodeRegistrationToken,
  CreatedUserAPIKey,
  Envelope,
  Friend,
  Health,
  HistoryMessage,
  KnowledgeCapsule,
  MailboxMessage,
  Node,
  NodeDaemonAgentConnection,
  NodeDaemonCommandData,
  NodeDaemonQueryResult,
  NodeRegistrationPreview,
  Pagination,
  PaxdConnectPreview,
  RepresentativeAgent,
  SessionApprovalMode,
  SessionArtifact,
  SessionKnowledgeInjection,
  Team,
  TeamAgent,
  TeamAuditEvent,
  TeamInvite,
  TeamMember,
  TeamSummary,
  TeamRole,
  UserAPIKey,
  CreatedNodeDaemonAgentConnection,
} from "./types";

type NodeListData = {
  nodes: Node[];
};

type AgentListData = {
  agents: Agent[];
};

type SessionListData = {
  pagination?: Pagination;
  sessions: AgentSession[];
};

type ListUserSessionsOptions = {
  agentIds?: string[];
  nodeIds?: string[];
  pageNum?: number;
  pageSize?: number;
};

type UpdateAgentSessionInput = {
  pax_config: {
    approval_mode: SessionApprovalMode;
  };
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

type TeamAuditEventListData = {
  events: TeamAuditEvent[];
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

type SessionArtifactListData = {
  artifacts: SessionArtifact[];
};

type SessionArtifactData = {
  artifact: SessionArtifact;
};

type RepresentativeAgentListData = {
  representative_agents: RepresentativeAgent[];
};

type RepresentativeAgentData = {
  profile: AgentProfile;
  representative_agent: RepresentativeAgent;
};

type ConversationMessagesData = {
  messages: HistoryMessage[];
};

type AgentOwnerInfoData = {
  owner_info: AgentOwnerInfo;
};

type StopSessionTurnInput = {
  reason?: string;
};

type StopSessionTurnData = {
  active_prompt_request_id?: string;
  agent_id: string;
  command_id: string;
  effect: "noop" | "cancelling" | "already_cancelling" | string;
  node_id?: string;
  session_id: string;
  status: string;
};

type QueueSessionTurnInput = {
  input: string;
};

type QueueSessionTurnData = {
  active_prompt_request_id?: string;
  agent_id: string;
  command_id: string;
  effect: "queued" | "replaced" | string;
  node_id?: string;
  queued_turn_id: string;
  session_id: string;
  status: string;
};

export type QueuedSessionTurnData = {
  agent_id: string;
  command_id: string;
  created_at: string;
  input: string;
  node_id?: string;
  queued_turn_id: string;
  session_id: string;
  updated_at: string;
};

type DeleteQueuedSessionTurnData = {
  agent_id: string;
  command_id: string;
  effect: "deleted" | "noop" | string;
  node_id?: string;
  queued_turn_id?: string;
  session_id: string;
  status: string;
};

type SteerSessionTurnInput = {
  input: string;
};

type SteerSessionTurnData = {
  active_prompt_request_id?: string;
  agent_id: string;
  command_id: string;
  effect: "steering" | string;
  node_id?: string;
  queue_effect: "queued" | "replaced" | string;
  queued_turn_id: string;
  session_id: string;
  status: string;
  stop_effect: "cancelling" | "already_cancelling" | "noop" | string;
};

export type AgentOwnerInfoLookup = {
  agentId?: string;
  representativeAgentId?: string;
};

export type UpdateNodeProfileInput = {
  description?: string;
  name?: string;
  user_metadata?: ApiRecord;
};

export type UpdateAgentProfileInput = {
  card?: ApiRecord;
  description?: string;
  name?: string;
  user_metadata?: ApiRecord;
};

export type CreateNodeDaemonAgentConnectionInput = {
  agent_type: string;
  command?: string[];
  harness: string;
  instance_id?: string;
  name: string;
  working_dir?: string;
};

export type UpdateNodeDaemonAgentConnectionInput = {
  command?: string[];
  harness?: string;
  name?: string;
  working_dir?: string;
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

export function getNodeDaemonStatus(userId: string, nodeId: string) {
  return apiFetch<NodeDaemonQueryResult>(
    userPath(userId, `/nodes/${nodeId}/daemon/status`),
  );
}

export function listNodeDaemonHarnesses(userId: string, nodeId: string) {
  return apiFetch<NodeDaemonQueryResult>(
    userPath(userId, `/nodes/${nodeId}/daemon/harnesses?include_missing=true`),
  );
}

export function discoverNodeDaemonHarnesses(
  userId: string,
  nodeId: string,
  input: { names?: string[]; probe?: boolean } = { probe: true },
) {
  return apiFetch<NodeDaemonQueryResult>(
    userPath(userId, `/nodes/${nodeId}/daemon/harnesses/discover`),
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function listNodeDaemonAgentConnections(userId: string, nodeId: string) {
  return apiFetch<NodeDaemonQueryResult>(
    userPath(
      userId,
      `/nodes/${nodeId}/daemon/agent-connections?include_disabled=true`,
    ),
  );
}

export function createNodeDaemonAgentConnection(
  userId: string,
  nodeId: string,
  input: CreateNodeDaemonAgentConnectionInput,
) {
  return apiFetch<CreatedNodeDaemonAgentConnection>(
    userPath(userId, `/nodes/${nodeId}/daemon/agent-connections`),
    {
      body: JSON.stringify({ command_id: createIdempotencyKey(), ...input }),
      method: "POST",
    },
  );
}

export function updateNodeDaemonAgentConnection(
  userId: string,
  nodeId: string,
  connectionId: string,
  input: UpdateNodeDaemonAgentConnectionInput,
) {
  return apiFetch<NodeDaemonCommandData>(
    userPath(
      userId,
      `/nodes/${nodeId}/daemon/agent-connections/${connectionId}`,
    ),
    {
      body: JSON.stringify({ command_id: createIdempotencyKey(), ...input }),
      method: "PATCH",
    },
  );
}

export function stopNodeDaemonAgentConnection(
  userId: string,
  nodeId: string,
  connectionId: string,
) {
  return runNodeDaemonAgentConnectionAction(
    userId,
    nodeId,
    connectionId,
    "stop",
  );
}

export function restartNodeDaemonAgentConnection(
  userId: string,
  nodeId: string,
  connectionId: string,
) {
  return runNodeDaemonAgentConnectionAction(
    userId,
    nodeId,
    connectionId,
    "restart",
  );
}

export function removeNodeDaemonAgentConnection(
  userId: string,
  nodeId: string,
  connectionId: string,
) {
  return apiFetch<NodeDaemonCommandData>(
    userPath(
      userId,
      `/nodes/${nodeId}/daemon/agent-connections/${connectionId}`,
    ),
    {
      body: JSON.stringify({ command_id: createIdempotencyKey() }),
      method: "DELETE",
    },
  );
}

export function getNodeDaemonCommand(
  userId: string,
  nodeId: string,
  commandId: string,
) {
  return apiFetch<NodeDaemonQueryResult>(
    userPath(userId, `/nodes/${nodeId}/daemon/commands/${commandId}`),
  );
}

function runNodeDaemonAgentConnectionAction(
  userId: string,
  nodeId: string,
  connectionId: string,
  action: "restart" | "stop",
) {
  return apiFetch<NodeDaemonCommandData>(
    userPath(
      userId,
      `/nodes/${nodeId}/daemon/agent-connections/${connectionId}/${action}`,
    ),
    {
      body: JSON.stringify({ command_id: createIdempotencyKey() }),
      method: "POST",
    },
  );
}

export function deleteNode(userId: string, nodeId: string) {
  return apiFetch<Node>(userPath(userId, `/nodes/${nodeId}`), {
    method: "DELETE",
  });
}

export function updateNodeProfile(
  userId: string,
  nodeId: string,
  input: UpdateNodeProfileInput,
) {
  return apiFetch<Node>(userPath(userId, `/nodes/${nodeId}`), {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export function listNodeAgents(userId: string, nodeId: string) {
  return apiFetch<AgentListData>(userPath(userId, `/nodes/${nodeId}/agents`));
}

export function listAgents(userId: string) {
  return apiFetch<AgentListData>(userPath(userId, "/agents"));
}

export function listUserSessions(
  userId: string,
  options: ListUserSessionsOptions = {},
) {
  const params = new URLSearchParams();
  appendCommaSeparatedParam(params, "node_id", options.nodeIds);
  appendCommaSeparatedParam(params, "agent_id", options.agentIds);
  if (options.pageSize) {
    params.set("page_size", String(options.pageSize));
  }
  if (options.pageNum) {
    params.set("page_num", String(options.pageNum));
  }

  const query = params.toString();
  return apiFetch<SessionListData>(
    `${userPath(userId, "/sessions")}${query ? `?${query}` : ""}`,
  );
}

export function getAgent(userId: string, agentId: string) {
  return apiFetch<Agent>(userPath(userId, `/agents/${agentId}`));
}

export function deleteAgent(userId: string, agentId: string) {
  return apiFetch<Agent>(userPath(userId, `/agents/${agentId}`), {
    method: "DELETE",
  });
}

export function getNodeAgent(userId: string, nodeId: string, agentId: string) {
  return apiFetch<Agent>(
    userPath(userId, `/nodes/${nodeId}/agents/${agentId}`),
  );
}

export function deleteNodeAgent(
  userId: string,
  nodeId: string,
  agentId: string,
) {
  return apiFetch<Agent>(
    userPath(userId, `/nodes/${nodeId}/agents/${agentId}`),
    { method: "DELETE" },
  );
}

export function updateNodeAgentProfile(
  userId: string,
  nodeId: string,
  agentId: string,
  input: UpdateAgentProfileInput,
) {
  return apiFetch<Agent>(
    userPath(userId, `/nodes/${nodeId}/agents/${agentId}`),
    {
      body: JSON.stringify(input),
      method: "PATCH",
    },
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

function appendCommaSeparatedParam(
  params: URLSearchParams,
  key: string,
  values?: string[],
) {
  const cleaned = [...new Set((values ?? []).map((value) => value.trim()))]
    .filter(Boolean)
    .sort();
  if (cleaned.length > 0) {
    params.set(key, cleaned.join(","));
  }
}

export function updateAgentSession(
  userId: string,
  nodeId: string,
  agentId: string,
  sessionId: string,
  input: UpdateAgentSessionInput,
) {
  return apiFetch<AgentSession>(
    userPath(
      userId,
      `/nodes/${nodeId}/agents/${agentId}/sessions/${sessionId}`,
    ),
    {
      body: JSON.stringify(input),
      method: "PATCH",
    },
  );
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

export function stopSessionTurn(
  userId: string,
  agentId: string,
  sessionId: string,
  input: StopSessionTurnInput = { reason: "user_requested" },
) {
  return apiFetch<StopSessionTurnData>(
    userPath(userId, `/agents/${agentId}/sessions/${sessionId}/turn/stop`),
    {
      body: JSON.stringify(input),
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
      method: "POST",
    },
  );
}

export function queueSessionTurn(
  userId: string,
  agentId: string,
  sessionId: string,
  input: QueueSessionTurnInput,
) {
  return apiFetch<QueueSessionTurnData>(
    userPath(userId, `/agents/${agentId}/sessions/${sessionId}/turn/queue`),
    {
      body: JSON.stringify(input),
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
      method: "POST",
    },
  );
}

export function getQueuedSessionTurn(
  userId: string,
  agentId: string,
  sessionId: string,
) {
  return apiFetch<QueuedSessionTurnData | null>(
    userPath(userId, `/agents/${agentId}/sessions/${sessionId}/turn/queue`),
  );
}

export function updateQueuedSessionTurn(
  userId: string,
  agentId: string,
  sessionId: string,
  input: QueueSessionTurnInput,
) {
  return apiFetch<QueuedSessionTurnData>(
    userPath(userId, `/agents/${agentId}/sessions/${sessionId}/turn/queue`),
    {
      body: JSON.stringify(input),
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
      method: "PATCH",
    },
  );
}

export function deleteQueuedSessionTurn(
  userId: string,
  agentId: string,
  sessionId: string,
) {
  return apiFetch<DeleteQueuedSessionTurnData>(
    userPath(userId, `/agents/${agentId}/sessions/${sessionId}/turn/queue`),
    {
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
      method: "DELETE",
    },
  );
}

export function steerSessionTurn(
  userId: string,
  agentId: string,
  sessionId: string,
  input: SteerSessionTurnInput,
) {
  return apiFetch<SteerSessionTurnData>(
    userPath(userId, `/agents/${agentId}/sessions/${sessionId}/turn/steer`),
    {
      body: JSON.stringify(input),
      headers: {
        "Idempotency-Key": createIdempotencyKey(),
      },
      method: "POST",
    },
  );
}

export function listSessionArtifacts(userId: string, sessionId: string) {
  return apiFetch<SessionArtifactListData>(
    userPath(userId, `/sessions/${sessionId}/artifacts`),
  );
}

export function createArtifactUpload(
  userId: string,
  input: {
    content_type?: string;
    filename: string;
    kind?: string;
    session_id?: string;
    size_bytes?: number;
    title?: string;
  },
) {
  return apiFetch<ArtifactUploadTicket>(userPath(userId, "/artifact-uploads"), {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function completeArtifactUpload(
  userId: string,
  uploadId: string,
  input: {
    kind?: string;
    payload_json?: Record<string, unknown>;
    session_id?: string;
    title?: string;
  },
) {
  return apiFetch<CompleteArtifactUploadData>(
    userPath(userId, `/artifact-uploads/${uploadId}/complete`),
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function getArtifact(userId: string, artifactId: string) {
  return apiFetch<SessionArtifactData>(
    userPath(userId, `/artifacts/${artifactId}`),
  );
}

export function getArtifactContentURL(
  userId: string,
  artifactId: string,
  ref = "main",
  disposition: "inline" | "attachment" = "inline",
) {
  const params = new URLSearchParams({ disposition });
  return apiFetch<ArtifactContentURL>(
    `${userPath(userId, `/artifacts/${artifactId}/content/${ref}`)}?${params}`,
  );
}

export function artifactContentDownloadHref(
  userId: string,
  artifactId: string,
  ref = "main",
) {
  const params = new URLSearchParams({
    disposition: "attachment",
    redirect: "1",
  });
  return `${API_BASE_URL}${userPath(userId, `/artifacts/${artifactId}/content/${ref}`)}?${params}`;
}

export function listRepresentativeAgents(
  userId: string,
  runtimeAgentId?: string,
) {
  const params = compactSearchParams({ runtime_agent_id: runtimeAgentId });
  return apiFetch<RepresentativeAgentListData>(
    `${userPath(userId, "/representative-agents")}${params ? `?${params}` : ""}`,
  );
}

export function upsertRepresentativeAgent(
  userId: string,
  input: {
    description?: string;
    display_name?: string;
    runtime_agent_id: string;
  },
) {
  return apiFetch<RepresentativeAgentData>(
    userPath(userId, "/representative-agents"),
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function startAgentInquiry(
  userId: string,
  nodeId: string,
  agentId: string,
  input: {
    conversation_id?: string;
    from_representative_agent_id?: string;
    input: string;
    max_turns?: number;
    to_representative_agent_id: string;
  },
) {
  return apiFetch<AgentInquiryResult>(
    userPath(userId, `/nodes/${nodeId}/agents/${agentId}/inquiries`),
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function listConversationMessages(
  userId: string,
  conversationId: string,
  limit = 100,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<ConversationMessagesData>(
    `${userPath(userId, `/conversations/${conversationId}/messages`)}?${params}`,
  );
}

export async function listAgentOwnerInfos(
  userId: string,
  lookups: AgentOwnerInfoLookup[],
) {
  const uniqueLookups = uniqueAgentOwnerLookups(lookups);
  const entries = await Promise.all(
    uniqueLookups.map(async (lookup) => {
      const params = new URLSearchParams(
        lookup.representativeAgentId
          ? { representative_agent_id: lookup.representativeAgentId }
          : { agent_id: lookup.agentId ?? "" },
      );
      const data = await apiFetch<AgentOwnerInfoData>(
        `${userPath(userId, "/agent-owner-info")}?${params}`,
      );
      return [lookup, data.owner_info] as const;
    }),
  );

  const byKey: Record<string, AgentOwnerInfo> = {};
  for (const [lookup, ownerInfo] of entries) {
    byKey[agentOwnerLookupKey(lookup)] = ownerInfo;
    if (ownerInfo.representative_agent?.representative_agent_id) {
      byKey[`rep:${ownerInfo.representative_agent.representative_agent_id}`] =
        ownerInfo;
    }
    if (ownerInfo.agent.agent_id) {
      byKey[`agent:${ownerInfo.agent.agent_id}`] = ownerInfo;
    }
  }

  return byKey;
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

export function archiveTeam(userId: string, teamId: string) {
  return apiFetch<TeamData>(userPath(userId, `/teams/${teamId}/archive`), {
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

export function updateTeamMemberRole(
  userId: string,
  teamId: string,
  memberUserId: string,
  role: Exclude<TeamRole, "owner">,
) {
  return apiFetch<{ member: TeamMember }>(
    userPath(userId, `/teams/${teamId}/members/${memberUserId}/role`),
    {
      body: JSON.stringify({ role }),
      method: "POST",
    },
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

export function cancelTeamInvite(
  userId: string,
  teamId: string,
  inviteId: string,
) {
  return apiFetch<{ invite: TeamInvite }>(
    userPath(userId, `/teams/${teamId}/invites/${inviteId}/cancel`),
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

export function listTeamAuditEvents(
  userId: string,
  teamId: string,
  limit = 50,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiFetch<TeamAuditEventListData>(
    `${userPath(userId, `/teams/${teamId}/audit`)}?${params}`,
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

export function useAgents(userId?: string) {
  return useQuery({
    queryKey: queryKeys.userAgents(userId ?? "pending"),
    queryFn: () => listAgents(userId as string),
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

export function useNodeDaemonStatus(userId?: string, nodeId?: string) {
  return useQuery({
    queryKey: queryKeys.nodeDaemonStatus(
      userId ?? "pending",
      nodeId ?? "pending",
    ),
    queryFn: () => getNodeDaemonStatus(userId as string, nodeId as string),
    enabled: Boolean(userId && nodeId),
  });
}

export function useNodeDaemonHarnesses(
  userId?: string,
  nodeId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.nodeDaemonHarnesses(
      userId ?? "pending",
      nodeId ?? "pending",
    ),
    queryFn: () => listNodeDaemonHarnesses(userId as string, nodeId as string),
    enabled: Boolean(userId && nodeId && enabled),
  });
}

export function useNodeDaemonAgentConnections(
  userId?: string,
  nodeId?: string,
  enabled = true,
  pollWhile?: (connections: NodeDaemonAgentConnection[]) => boolean,
) {
  return useQuery({
    queryKey: queryKeys.nodeDaemonAgentConnections(
      userId ?? "pending",
      nodeId ?? "pending",
    ),
    queryFn: () =>
      listNodeDaemonAgentConnections(userId as string, nodeId as string),
    enabled: Boolean(userId && nodeId && enabled),
    refetchInterval: (query) => {
      if (query.state.error || query.state.data?.error) {
        return false;
      }
      const connections = query.state.data?.agent_connections?.items ?? [];
      return pollWhile?.(connections) ? 1_000 : false;
    },
  });
}

export function useNodeDaemonCommand(
  userId?: string,
  nodeId?: string,
  commandId?: string,
) {
  return useQuery({
    queryKey: queryKeys.nodeDaemonCommand(
      userId ?? "pending",
      nodeId ?? "pending",
      commandId ?? "pending",
    ),
    queryFn: () =>
      getNodeDaemonCommand(
        userId as string,
        nodeId as string,
        commandId as string,
      ),
    enabled: Boolean(userId && nodeId && commandId),
    refetchInterval: (query) => {
      if (query.state.error || query.state.data?.error) {
        return false;
      }
      const status = query.state.data?.command?.status;
      return status && ["applied", "failed", "rejected"].includes(status)
        ? false
        : 1_000;
    },
  });
}

export function useAgent(userId?: string, agentId?: string) {
  return useQuery({
    queryKey: queryKeys.userAgent(userId ?? "pending", agentId ?? "pending"),
    queryFn: () => getAgent(userId as string, agentId as string),
    enabled: Boolean(userId && agentId),
  });
}

export function useRepresentativeAgents(
  userId?: string,
  runtimeAgentId?: string,
) {
  return useQuery({
    queryKey: queryKeys.representativeAgents(
      userId ?? "pending",
      runtimeAgentId,
    ),
    queryFn: () =>
      listRepresentativeAgents(userId as string, runtimeAgentId as string),
    enabled: Boolean(userId && runtimeAgentId),
  });
}

export function useConversationMessages(
  userId?: string,
  conversationId?: string,
  limit = 100,
) {
  return useQuery({
    queryKey: queryKeys.conversationMessages(
      userId ?? "pending",
      conversationId ?? "pending",
    ),
    queryFn: () =>
      listConversationMessages(
        userId as string,
        conversationId as string,
        limit,
      ),
    enabled: Boolean(userId && conversationId),
  });
}

export function useAgentOwnerInfos(
  userId?: string,
  lookups: AgentOwnerInfoLookup[] = [],
) {
  const uniqueLookups = uniqueAgentOwnerLookups(lookups);
  const lookupKeys = uniqueLookups.map(agentOwnerLookupKey);
  return useQuery({
    queryKey: queryKeys.agentOwnerInfos(userId ?? "pending", lookupKeys),
    queryFn: () => listAgentOwnerInfos(userId as string, uniqueLookups),
    enabled: Boolean(userId && uniqueLookups.length > 0),
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

export function useTeamAuditEvents(
  userId?: string,
  teamId?: string,
  limit = 50,
) {
  return useQuery({
    queryKey: queryKeys.teamAudit(
      userId ?? "pending",
      teamId ?? "pending",
      limit,
    ),
    queryFn: () =>
      listTeamAuditEvents(userId as string, teamId as string, limit),
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

export function useSessionArtifacts(userId?: string, sessionId?: string) {
  return useQuery({
    queryKey: queryKeys.sessionArtifacts(
      userId ?? "pending",
      sessionId ?? "pending",
    ),
    queryFn: () => listSessionArtifacts(userId as string, sessionId as string),
    enabled: Boolean(userId && sessionId),
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

function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `cmd_${Date.now()}`;
}

function uniqueAgentOwnerLookups(lookups: AgentOwnerInfoLookup[]) {
  const byKey = new Map<string, AgentOwnerInfoLookup>();
  for (const lookup of lookups) {
    const normalized = {
      agentId: lookup.agentId?.trim(),
      representativeAgentId: lookup.representativeAgentId?.trim(),
    };
    if (!normalized.agentId && !normalized.representativeAgentId) {
      continue;
    }

    byKey.set(agentOwnerLookupKey(normalized), normalized);
  }

  return [...byKey.values()].sort((a, b) =>
    agentOwnerLookupKey(a).localeCompare(agentOwnerLookupKey(b)),
  );
}

function agentOwnerLookupKey(lookup: AgentOwnerInfoLookup) {
  return lookup.representativeAgentId
    ? `rep:${lookup.representativeAgentId}`
    : `agent:${lookup.agentId ?? ""}`;
}
