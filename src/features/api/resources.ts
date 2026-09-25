"use client";

import type { MessageDetailPage } from "./types";

import {
  type QueryClient,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { API_BASE_URL, apiFetch, userPath } from "./client";
import { ApiError, AuthError } from "./errors";
import { queryKeys } from "./query-keys";
import {
  ApiRecord,
  Agent,
  AgentOwnerInfo,
  AgentPermissionCatalog,
  AgentInquiryResult,
  AgentApproval,
  AgentProfile,
  AgentSession,
  ApprovedNodeRegistration,
  ApprovedPaxlDeviceLogin,
  ArtifactContentURL,
  ArtifactPublicationContentState,
  ArtifactPublicationState,
  ArtifactUploadTicket,
  CompleteArtifactUploadData,
  CreateProjectInput,
  CreateProjectTargetInput,
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
  PaxdRelease,
  PaxdConnectPreview,
  RepresentativeAgent,
  Project,
  ProjectTarget,
  SessionApprovalMode,
  SessionConfiguration,
  SessionArtifact,
  UserAttachment,
  UserAttachmentUploadTicket,
  SessionKnowledgeInjection,
  Team,
  TeamAgent,
  TeamAuditEvent,
  TeamInvite,
  TeamMember,
  TeamSummary,
  TeamRole,
  UpdateProjectInput,
  UpdateProjectTargetInput,
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
  includeArchived?: boolean;
  nodeIds?: string[];
  pageNum?: number;
  pageSize?: number;
  primaryProjectId?: string;
};

type ProjectListData = {
  projects: Project[];
};

type ProjectData = {
  project: Project;
};

type ProjectTargetListData = {
  targets: ProjectTarget[];
};

type ProjectTargetData = {
  target: ProjectTarget;
};

type UpdateAgentSessionInput = {
  archived?: boolean;
  name?: string;
  use_reported_name?: boolean;
  pax_config?: {
    approval_mode: SessionApprovalMode;
  };
};

type MailboxListData = {
  messages: MailboxMessage[];
};

type HistoryListData = {
  messages: HistoryMessage[] | null;
  pagination?: {
    has_more?: boolean;
    next_before_id?: number;
    // seq refactor cursors
    head_seq?: number;
    has_older?: boolean;
    has_newer?: boolean;
    next_before_seq?: number;
    next_after_seq?: number;
  };
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

type UserAttachmentUploadData = {
  attachment: UserAttachment;
};

type ArtifactPublicationContentQuery = {
  disposition?: "inline" | "attachment";
  redirect?: boolean;
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

export type ResetSessionRuntimeData = {
  command_id: string;
  expected_turn_instance_id: string;
  projection_revision: number;
  reset_status: string;
  status: "accepted_pending" | string;
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
  state?: "queued" | "sending" | "uncertain";
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
  desired_slots?: number;
  harness: string;
  instance_id?: string;
  name: string;
  working_dir?: string;
  report_local_sessions?: boolean;
};

export type UpdateNodeDaemonAgentConnectionInput = {
  command?: string[];
  desired_slots?: number;
  desired_state?: "running" | "stopped";
  harness?: string;
  name?: string;
  working_dir?: string;
  report_local_sessions?: boolean;
};

export function getHealth() {
  return apiFetch<Health>("/api/v1/health");
}

export function listNodes(userId: string) {
  return apiFetch<NodeListData>(userPath(userId, "/nodes"));
}

export function getLatestPaxdRelease(os: string, arch: string) {
  const platform = `${os.trim()}/${arch.trim()}`.toLowerCase();
  return apiFetch<PaxdRelease>(
    `/api/v1/public/paxd/download?platform=${encodeURIComponent(platform)}&tags=stable`,
  );
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

export function restartNodeDaemon(userId: string, nodeId: string) {
  return apiFetch<NodeDaemonCommandData>(
    userPath(userId, `/nodes/${nodeId}/daemon/restart`),
    {
      body: JSON.stringify({
        command_id: createIdempotencyKey(),
        mode: "immediate",
      }),
      method: "POST",
    },
  );
}

export function upgradeNodeDaemon(
  userId: string,
  nodeId: string,
  input: { version: string },
) {
  return apiFetch<NodeDaemonCommandData>(
    userPath(userId, `/nodes/${nodeId}/daemon/upgrade`),
    {
      body: JSON.stringify({
        command_id: createIdempotencyKey(),
        version: input.version.trim(),
        tag: "stable",
        mode: "immediate",
      }),
      method: "POST",
    },
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
      body: JSON.stringify({
        command_id: createIdempotencyKey(),
        desired_slots: 2,
        ...input,
      }),
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

export function startNodeDaemonAgentConnection(
  userId: string,
  nodeId: string,
  connectionId: string,
) {
  return updateNodeDaemonAgentConnection(userId, nodeId, connectionId, {
    desired_state: "running",
  });
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

export function openNodeDaemonSecretChannel(userId: string, nodeId: string) {
  return apiFetch<NodeDaemonQueryResult>(
    userPath(userId, `/nodes/${nodeId}/daemon/secret-channel/open`),
  );
}

export function pushNodeDaemonSecretChannel(
  userId: string,
  nodeId: string,
  input: {
    // Unlike other daemon commands, command_id here is not just an
    // idempotency key: the caller must have already used this exact value
    // while sealing the payload (it is bound into the AES-GCM additional
    // data), so it cannot be generated here.
    command_id: string;
    channel_id: string;
    sender_public_key: string;
    nonce: string;
    ciphertext: string;
  },
) {
  return apiFetch<NodeDaemonCommandData>(
    userPath(userId, `/nodes/${nodeId}/daemon/secret-channel/push`),
    {
      body: JSON.stringify(input),
      method: "POST",
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

export function listAgents(
  userId: string,
  scope: "accessible" | "owned" = "accessible",
) {
  const suffix = scope === "owned" ? "/agents?scope=owned" : "/agents";
  return apiFetch<AgentListData>(userPath(userId, suffix));
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
  if (options.primaryProjectId?.trim()) {
    params.set("primary_project_id", options.primaryProjectId.trim());
  }
  if (options.includeArchived) {
    params.set("include_archived", "true");
  }

  const query = params.toString();
  return apiFetch<SessionListData>(
    `${userPath(userId, "/sessions")}${query ? `?${query}` : ""}`,
  );
}

export async function getUserSession(
  userId: string,
  sessionId: string,
  agentId?: string,
  nodeId?: string,
) {
  if (agentId && nodeId) {
    return apiFetch<AgentSession>(
      userPath(
        userId,
        `/nodes/${encodeURIComponent(nodeId)}/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`,
      ),
    );
  }
  const pageSize = 200;
  let pageNum = 1;

  while (true) {
    const page = await listUserSessions(userId, {
      includeArchived: true,
      pageNum,
      pageSize,
    });
    const session = page.sessions.find((item) => item.session_id === sessionId);
    if (session) {
      if (!session.agent_id || !session.node_id) return session;
      return getUserSession(
        userId,
        sessionId,
        session.agent_id,
        session.node_id,
      );
    }

    if (page.pagination?.total_pages) {
      if (pageNum >= page.pagination.total_pages) {
        return null;
      }
    } else if (page.sessions.length < pageSize) {
      return null;
    }
    pageNum += 1;
  }
}

export function getAgent(userId: string, agentId: string) {
  return apiFetch<Agent>(userPath(userId, `/agents/${agentId}`));
}

export function getAgentPermissionCatalog(userId: string, agentId: string) {
  return apiFetch<AgentPermissionCatalog>(
    userPath(userId, `/agents/${agentId}/permission-catalog`),
  );
}

export function refreshAgentPermissionCatalog(
  queryClient: QueryClient,
  userId: string,
  agentId: string,
) {
  return queryClient.fetchQuery({
    queryKey: queryKeys.agentPermissionCatalog(userId, agentId),
    queryFn: () => getAgentPermissionCatalog(userId, agentId),
    // A fresh pax_only response can predate session/new. Force a network read
    // because the workbench disables its catalog observer after assignment.
    staleTime: 0,
  });
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

export function setAgentSessionPermission(
  userId: string,
  nodeId: string,
  agentId: string,
  sessionId: string,
  permissionChoiceId: string,
) {
  return apiFetch<AgentSession>(
    userPath(
      userId,
      `/nodes/${nodeId}/agents/${agentId}/sessions/${sessionId}/permission`,
    ),
    {
      body: JSON.stringify({ permission_choice_id: permissionChoiceId }),
      method: "POST",
    },
  );
}

function sessionConfigurationPath(
  userId: string,
  nodeId: string,
  agentId: string,
  sessionId: string,
) {
  return userPath(
    userId,
    `/nodes/${nodeId}/agents/${agentId}/sessions/${sessionId}/configuration`,
  );
}

export function getSessionConfiguration(
  userId: string,
  nodeId: string,
  agentId: string,
  sessionId: string,
) {
  return apiFetch<SessionConfiguration>(
    sessionConfigurationPath(userId, nodeId, agentId, sessionId),
  );
}

export function setSessionConfigOption(
  userId: string,
  nodeId: string,
  agentId: string,
  sessionId: string,
  configId: string,
  value: string | boolean,
) {
  return apiFetch<SessionConfiguration>(
    `${sessionConfigurationPath(userId, nodeId, agentId, sessionId)}/options/${encodeURIComponent(configId)}`,
    {
      body: JSON.stringify({ value }),
      method: "PATCH",
    },
  );
}

export function forceRefreshSessionConfiguration(
  userId: string,
  nodeId: string,
  agentId: string,
  sessionId: string,
) {
  return apiFetch<SessionConfiguration>(
    `${sessionConfigurationPath(userId, nodeId, agentId, sessionId)}/refresh`,
    { method: "POST" },
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
  sessionId: string,
  limit = 100,
  cursor: {
    beforeSeq?: number;
    afterSeq?: number;
    beforeId?: number;
    turnId?: string;
  } = {},
) {
  const params = new URLSearchParams({
    limit: String(limit),
    view: cursor.beforeId ? "full" : "summary",
  });
  if (cursor.turnId) params.set("turn_id", cursor.turnId);
  if (cursor.afterSeq && cursor.afterSeq > 0) {
    params.set("after_seq", String(cursor.afterSeq));
  } else if (cursor.beforeSeq && cursor.beforeSeq > 0) {
    params.set("before_seq", String(cursor.beforeSeq));
  } else if (cursor.beforeId && cursor.beforeId > 0) {
    params.set("before_id", String(cursor.beforeId));
  }
  return apiFetch<HistoryListData>(
    `${userPath(userId, `/sessions/${sessionId}/history`)}?${params}`,
  );
}

export function flattenSessionHistoryPages(pages?: HistoryListData[]) {
  const messages = new Map<string, HistoryMessage>();
  for (const page of [...(pages ?? [])].reverse()) {
    for (const message of page.messages ?? []) {
      const existing = messages.get(message.message_id);
      if (
        existing?.updated_at &&
        message.updated_at &&
        existing.updated_at > message.updated_at
      )
        continue;
      messages.set(message.message_id, message);
    }
  }
  const ordered = [...messages.values()];
  if (ordered.every((message) => typeof message.session_seq === "number")) {
    ordered.sort((a, b) => a.session_seq! - b.session_seq!);
  }
  return ordered;
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

export function resetSessionRuntime(
  userId: string,
  agentId: string,
  sessionId: string,
  expectedTurnInstanceId: string,
) {
  return apiFetch<ResetSessionRuntimeData>(
    userPath(userId, `/agents/${agentId}/sessions/${sessionId}/runtime/reset`),
    {
      body: JSON.stringify({
        expected_turn_instance_id: expectedTurnInstanceId,
      }),
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

export function createUserAttachment(
  userId: string,
  input: {
    content_type?: string;
    conversation_id?: string;
    filename: string;
    sha256?: string;
    size_bytes?: number;
  },
) {
  return apiFetch<UserAttachmentUploadTicket>(
    userPath(userId, "/attachments"),
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function completeUserAttachment(userId: string, attachmentId: string) {
  return apiFetch<UserAttachmentUploadData>(
    userPath(userId, `/attachments/${attachmentId}/complete`),
    {
      body: JSON.stringify({}),
      method: "POST",
    },
  );
}

export function userAttachmentContentHref(
  userId: string,
  attachmentId: string,
) {
  return `${API_BASE_URL}${userPath(userId, `/attachments/${encodeURIComponent(attachmentId)}/content`)}`;
}

async function fetchObjectStorage(
  url: string,
  init: RequestInit,
  failureMessage: string,
) {
  try {
    return await fetch(url, {
      ...init,
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new Error(failureMessage);
  }
}

export async function uploadUserAttachmentFile(
  ticket: UserAttachmentUploadTicket,
  file: File,
) {
  if (ticket.upload.protocol === "s3_presigned_put") {
    const uploadResponse = await fetchObjectStorage(
      ticket.upload.url,
      {
        body: file,
        headers: ticket.upload.headers,
        method: "PUT",
      },
      "Attachment upload request failed",
    );

    // With write-once presigned PUTs, 412 can mean an earlier attempt stored
    // the object but its response was lost. The manager's complete endpoint
    // performs the authoritative HEAD validation before accepting it.
    if (!uploadResponse.ok && uploadResponse.status !== 412) {
      throw new Error(`Attachment upload failed with ${uploadResponse.status}`);
    }
    return;
  }

  if (ticket.upload.protocol !== "gcs_resumable") {
    throw new Error(
      `Unsupported attachment upload protocol "${ticket.upload.protocol}".`,
    );
  }

  const initHeaders = new Headers(ticket.upload.headers);
  const initResponse = await fetchObjectStorage(
    ticket.upload.url,
    {
      body: null,
      headers: initHeaders,
      method: ticket.upload.method,
    },
    "Attachment upload initialization request failed",
  );

  if (!initResponse.ok) {
    throw new Error(
      `Attachment upload initialization failed with ${initResponse.status}`,
    );
  }

  const sessionUrl = initResponse.headers.get("Location");
  if (!sessionUrl) {
    throw new Error(
      "Attachment upload initialization did not return a resumable session URL.",
    );
  }

  const uploadHeaders = new Headers();
  const contentType = ticket.attachment.content_type || file.type;
  if (contentType) {
    uploadHeaders.set("Content-Type", contentType);
  }

  const uploadResponse = await fetchObjectStorage(
    sessionUrl,
    {
      body: file,
      headers: uploadHeaders,
      method: "PUT",
    },
    "Attachment upload request failed",
  );

  if (!uploadResponse.ok) {
    throw new Error(`Attachment upload failed with ${uploadResponse.status}`);
  }
}

export function getArtifactPublication(userId: string, publicationId: string) {
  return apiFetch<ArtifactPublicationState>(
    userPath(userId, `/artifact-publications/${publicationId}`),
  );
}

export async function getArtifactPublicationContent(
  userId: string,
  publicationId: string,
  ref = "main",
  query: ArtifactPublicationContentQuery = {},
) {
  const params = new URLSearchParams();
  if (query.disposition) {
    params.set("disposition", query.disposition);
  }
  if (query.redirect) {
    params.set("redirect", "true");
  }

  const response = await fetch(
    `${API_BASE_URL}${userPath(userId, `/artifact-publications/${publicationId}/content/${ref}`)}${params.size > 0 ? `?${params}` : ""}`,
    {
      credentials: "include",
      redirect: "manual",
    },
  );

  if (
    response.status === 0 ||
    response.status === 401 ||
    response.status === 403 ||
    (response.status >= 300 && response.status < 400) ||
    response.type === "opaqueredirect"
  ) {
    throw new AuthError();
  }

  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    throw new ApiError(
      `Expected JSON response from PAX API, received ${contentType ?? "unknown content type"}`,
      response.status,
      null,
    );
  }

  const body = (await response.json()) as {
    code: number;
    data: ArtifactPublicationContentState;
    message?: string;
  };

  if (response.status === 202 || response.status === 409) {
    return {
      ...body.data,
      retry_after_seconds: retryAfterSeconds(response),
    } satisfies ArtifactPublicationContentState;
  }

  if (!response.ok || body.code >= 400) {
    throw new ApiError(
      body.message ?? "PAX API request failed",
      response.status,
      body,
    );
  }

  return {
    ...body.data,
    retry_after_seconds: retryAfterSeconds(response),
  } satisfies ArtifactPublicationContentState;
}

export function artifactPublicationContentDownloadHref(
  userId: string,
  publicationId: string,
  ref = "main",
) {
  const params = new URLSearchParams({
    disposition: "attachment",
    redirect: "true",
  });
  return `${API_BASE_URL}${userPath(userId, `/artifact-publications/${publicationId}/content/${ref}`)}?${params}`;
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
  options: { primaryProjectId?: string } = {},
) {
  return apiFetch<AgentSession>(
    userPath(userId, `/nodes/${nodeId}/agents/${agentId}/sessions`),
    {
      body: JSON.stringify({
        agent_id: agentId,
        name,
        node_id: nodeId,
        ...(options.primaryProjectId
          ? { primary_project_id: options.primaryProjectId }
          : {}),
        source: "console",
        user_id: userId,
      }),
      method: "POST",
    },
  );
}

export function listProjects(userId: string, includeArchived = false) {
  const query = includeArchived ? "?include_archived=true" : "";
  return apiFetch<ProjectListData>(userPath(userId, `/projects${query}`));
}

export function getProject(userId: string, projectId: string) {
  return apiFetch<ProjectData>(userPath(userId, `/projects/${projectId}`));
}

export function createProject(userId: string, input: CreateProjectInput) {
  return apiFetch<ProjectData>(userPath(userId, "/projects"), {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function updateProject(
  userId: string,
  projectId: string,
  input: UpdateProjectInput,
) {
  return apiFetch<ProjectData>(userPath(userId, `/projects/${projectId}`), {
    body: JSON.stringify(input),
    method: "PATCH",
  });
}

export function archiveProject(userId: string, projectId: string) {
  return apiFetch<ProjectData>(
    userPath(userId, `/projects/${projectId}/archive`),
    { method: "POST" },
  );
}

export function listProjectTargets(userId: string, projectId: string) {
  return apiFetch<ProjectTargetListData>(
    userPath(userId, `/projects/${projectId}/targets`),
  );
}

export function getProjectTarget(
  userId: string,
  projectId: string,
  targetId: string,
) {
  return apiFetch<ProjectTargetData>(
    userPath(userId, `/projects/${projectId}/targets/${targetId}`),
  );
}

export function createProjectTarget(
  userId: string,
  projectId: string,
  input: CreateProjectTargetInput,
) {
  return apiFetch<ProjectTargetData>(
    userPath(userId, `/projects/${projectId}/targets`),
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function updateProjectTarget(
  userId: string,
  projectId: string,
  targetId: string,
  input: UpdateProjectTargetInput,
) {
  return apiFetch<ProjectTargetData>(
    userPath(userId, `/projects/${projectId}/targets/${targetId}`),
    {
      body: JSON.stringify(input),
      method: "PATCH",
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

export function useNodes(userId?: string, refetchInterval = 15_000) {
  // Hooks in this file are thin TanStack Query wrappers around pax-manager
  // resources. They own caching/loading state; components only compose results.
  return useQuery({
    queryKey: queryKeys.nodes(userId ?? "pending"),
    queryFn: () => listNodes(userId as string),
    enabled: Boolean(userId),
    refetchInterval,
    refetchOnWindowFocus: "always",
  });
}

export function useLatestPaxdRelease(
  os?: string,
  arch?: string,
  enabled = true,
) {
  const platform = `${os ?? "pending"}/${arch ?? "pending"}`.toLowerCase();
  return useQuery({
    queryKey: queryKeys.latestPaxdRelease(platform, "stable"),
    queryFn: () => getLatestPaxdRelease(os as string, arch as string),
    enabled: Boolean(os && arch && enabled),
    staleTime: 60_000,
  });
}

export function useAgents(
  userId?: string,
  scope: "accessible" | "owned" = "accessible",
) {
  return useQuery({
    queryKey: queryKeys.userAgents(userId ?? "pending", scope),
    queryFn: () => listAgents(userId as string, scope),
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

export function useAgentPermissionCatalog(
  userId?: string,
  agentId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.agentPermissionCatalog(
      userId ?? "pending",
      agentId ?? "pending",
    ),
    queryFn: () =>
      getAgentPermissionCatalog(userId as string, agentId as string),
    enabled: Boolean(userId && agentId && enabled),
    retry: false,
  });
}

export function useSessionConfiguration(
  userId?: string,
  nodeId?: string,
  agentId?: string,
  sessionId?: string,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.sessionConfiguration(
      userId ?? "pending",
      nodeId ?? "pending",
      agentId ?? "pending",
      sessionId ?? "pending",
    ),
    queryFn: () =>
      getSessionConfiguration(
        userId as string,
        nodeId as string,
        agentId as string,
        sessionId as string,
      ),
    enabled: Boolean(userId && nodeId && agentId && sessionId && enabled),
    refetchInterval: 10_000,
    retry: false,
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

export function useProjects(userId?: string, includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.projects(userId ?? "pending", includeArchived),
    queryFn: () => listProjects(userId as string, includeArchived),
    enabled: Boolean(userId),
  });
}

export function useProject(userId?: string, projectId?: string) {
  return useQuery({
    queryKey: queryKeys.project(userId ?? "pending", projectId ?? "pending"),
    queryFn: () => getProject(userId as string, projectId as string),
    enabled: Boolean(userId && projectId),
  });
}

export function useProjectTargets(userId?: string, projectId?: string) {
  return useQuery({
    queryKey: queryKeys.projectTargets(
      userId ?? "pending",
      projectId ?? "pending",
    ),
    queryFn: () => listProjectTargets(userId as string, projectId as string),
    enabled: Boolean(userId && projectId),
  });
}

export function useProjectTarget(
  userId?: string,
  projectId?: string,
  targetId?: string,
) {
  return useQuery({
    queryKey: queryKeys.projectTarget(
      userId ?? "pending",
      projectId ?? "pending",
      targetId ?? "pending",
    ),
    queryFn: () =>
      getProjectTarget(
        userId as string,
        projectId as string,
        targetId as string,
      ),
    enabled: Boolean(userId && projectId && targetId),
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
    refetchInterval: 30_000,
  });
}

export function useUserSession(
  userId?: string,
  sessionId?: string,
  agentId?: string,
  refetchInterval = 30_000,
) {
  const client = useQueryClient();
  return useQuery({
    queryKey: queryKeys.sessionMetadata(
      userId ?? "pending",
      sessionId ?? "pending",
    ),
    queryFn: async () => {
      // Client-side read timing, not a field supplied by Manager. Capture before
      // the request so a delayed pre-submit response cannot finish a new turn.
      const runtimeSnapshotRequestedAt = Date.now();
      const session = await getUserSession(
        userId as string,
        sessionId as string,
        agentId ??
          client.getQueryData<AgentSession>(
            queryKeys.sessionMetadata(
              userId ?? "pending",
              sessionId ?? "pending",
            ),
          )?.agent_id,
        client.getQueryData<AgentSession>(
          queryKeys.sessionMetadata(
            userId ?? "pending",
            sessionId ?? "pending",
          ),
        )?.node_id,
      );
      return session ? { ...session, runtimeSnapshotRequestedAt } : null;
    },
    enabled: Boolean(userId && sessionId),
    refetchInterval,
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

export function useSessionHistory(userId?: string, sessionId?: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.sessionHistory(
      userId ?? "pending",
      sessionId ?? "pending",
    ),
    queryFn: ({ pageParam }) =>
      listSessionHistory(userId as string, sessionId as string, 100, {
        beforeSeq: pageParam,
      }),
    enabled: Boolean(userId && sessionId),
    // Scroll back by the seq cursor; the server returns the latest page when no
    // cursor is given and advertises has_older / next_before_seq.
    getNextPageParam: (lastPage) => {
      const nextBeforeSeq = lastPage.pagination?.next_before_seq;
      return lastPage.pagination?.has_older &&
        nextBeforeSeq &&
        nextBeforeSeq > 0
        ? nextBeforeSeq
        : undefined;
    },
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
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

export function useArtifact(userId?: string, artifactId?: string) {
  return useQuery({
    queryKey: queryKeys.artifact(userId ?? "pending", artifactId ?? "pending"),
    queryFn: () => getArtifact(userId as string, artifactId as string),
    enabled: Boolean(userId && artifactId),
    refetchOnWindowFocus: true,
  });
}

export function useArtifactPublication(
  userId?: string,
  publicationId?: string,
) {
  return useQuery({
    queryKey: queryKeys.artifactPublication(
      userId ?? "pending",
      publicationId ?? "pending",
    ),
    queryFn: () =>
      getArtifactPublication(userId as string, publicationId as string),
    enabled: Boolean(userId && publicationId),
    refetchInterval: (query) => {
      const status = query.state.data?.publication.status;
      return status === "queued" || status === "uploading" ? 2_000 : false;
    },
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

function retryAfterSeconds(response: Response) {
  const retryAfter = response.headers.get("retry-after");
  const parsed = retryAfter ? Number(retryAfter) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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

export function useMessageDetail(
  userId: string | undefined,
  sessionId: string,
  messageId: string,
  section: "input" | "output",
  updatedAt?: string,
  complete = true,
) {
  return useInfiniteQuery({
    queryKey: [
      "message-detail",
      userId,
      sessionId,
      messageId,
      section,
      updatedAt,
      complete,
    ],
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        section,
        offset: String(pageParam.offset),
      });
      if (pageParam.revision) params.set("revision", pageParam.revision);
      return apiFetch<MessageDetailPage>(
        userPath(
          userId as string,
          `/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}?${params}`,
        ),
        { signal },
      );
    },
    initialPageParam: { offset: 0, revision: "" },
    getNextPageParam: (page) =>
      page.has_more
        ? { offset: page.next_offset, revision: page.revision }
        : undefined,
    enabled: Boolean(userId),
    staleTime: complete ? Infinity : 0,
    // Refresh only the first page while running. A multi-page read remains
    // pinned to its revision and explicitly reloads if the content changes.
    refetchInterval: (query) =>
      !complete && (query.state.data?.pages.length ?? 0) <= 1 ? 2000 : false,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
