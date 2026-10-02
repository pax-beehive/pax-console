import {
  Agent,
  AgentSession,
  Node,
  NodeDaemonAgentConnection,
} from "@/features/api/types";

export type NodeDaemonRuntimeTarget = {
  action: "create" | "remove" | "restart" | "start" | "stop" | "update";
  connectionId: string;
  desiredGeneration?: number;
  desiredRestartNonce?: number;
  expectedPhase?: "running" | "stopped";
};

export type NodeDaemonRuntimeOutcome =
  | "failed"
  | "removed"
  | "running"
  | "stopped";

export type SessionRow = AgentSession & {
  agentActive: boolean;
  agentLabel: string;
  nodeActive: boolean;
  nodeLabel: string;
};

export type AgentRow = Agent & {
  nodeActive: boolean;
  nodeLabel: string;
};

const activeStatuses = new Set([
  "active",
  "connected",
  "healthy",
  "idle",
  "online",
  "open",
  "pending",
  "queued",
  "ready",
  "running",
  "waiting_approval",
]);

const inactiveStatuses = new Set([
  "archived",
  "canceled",
  "cancelled",
  "closed",
  "complete",
  "completed",
  "deleted",
  "done",
  "error",
  "failed",
  "inactive",
  "offline",
  "removed",
  "revoked",
  "stopped",
]);

export function nodeLabel(node: Node) {
  return node.name ?? node.hostname ?? node.node_id;
}

export function isDeviceNode(node: Node) {
  // CLI login identities share the node API but are not runtime devices.
  return node.kind !== "paxl";
}

export function agentLabel(agent: Agent) {
  return agent.name ?? agent.agent_type ?? agent.agent_id;
}

export function resourceLastActiveAt(resource: {
  created_at?: string;
  last_active_at?: string;
  last_heartbeat?: string;
  last_message_at?: string;
  registered_at?: string;
  updated_at?: string;
}) {
  return (
    resource.last_active_at ??
    resource.last_message_at ??
    resource.updated_at ??
    resource.last_heartbeat ??
    resource.registered_at ??
    resource.created_at
  );
}

export function sessionUpdatedAt(session: AgentSession) {
  return (
    session.last_user_message_at ??
    session.last_message_at ??
    session.updated_at ??
    session.last_active_at
  );
}

export function byLastActiveDesc<T>(
  items: readonly T[],
  getTimestamp: (item: T) => string | undefined,
  getTieBreaker: (item: T) => string,
) {
  return [...items].sort((left, right) => {
    const timestampDelta =
      timestampValue(getTimestamp(right)) - timestampValue(getTimestamp(left));
    if (timestampDelta !== 0) {
      return timestampDelta;
    }

    return getTieBreaker(left).localeCompare(getTieBreaker(right));
  });
}

export function paginateItems<T>(
  items: readonly T[],
  page: number,
  pageSize: number,
) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(items.length / safePageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(page)), pageCount);
  const startOffset = (currentPage - 1) * safePageSize;
  const endOffset = Math.min(startOffset + safePageSize, items.length);

  return {
    currentPage,
    endIndex: items.length === 0 ? 0 : endOffset,
    items: items.slice(startOffset, endOffset),
    pageCount,
    startIndex: items.length === 0 ? 0 : startOffset + 1,
    totalCount: items.length,
  };
}

export function isActiveNode(node: Node) {
  return isActiveResource(node.online, node.status);
}

export function isActiveAgent(agent: Agent) {
  return isActiveResource(agent.online, agent.status);
}

export function isActiveSession(session: AgentSession) {
  return session.runtime_status !== "idle";
}

export function buildSessionRows(
  sessions: readonly AgentSession[],
  agents: readonly Agent[],
  nodes: readonly Node[],
) {
  const agentsById = new Map(agents.map((agent) => [agent.agent_id, agent]));
  const nodesById = new Map(nodes.map((node) => [node.node_id, node]));

  return sessions.map((session): SessionRow => {
    const agent = agentsById.get(session.agent_id);
    const node = nodesById.get(session.node_id);

    return {
      ...session,
      agentActive: agent ? isActiveAgent(agent) : false,
      agentLabel: agent ? agentLabel(agent) : session.agent_id,
      nodeActive: node ? isActiveNode(node) : false,
      nodeLabel: node ? nodeLabel(node) : session.node_id,
    };
  });
}

export function buildAgentRows(
  agents: readonly Agent[],
  nodes: readonly Node[],
) {
  const nodesById = new Map(nodes.map((node) => [node.node_id, node]));

  return agents.map((agent): AgentRow => {
    const node = agent.node_id ? nodesById.get(agent.node_id) : undefined;

    return {
      ...agent,
      nodeActive: node ? isActiveNode(node) : false,
      nodeLabel: node ? nodeLabel(node) : (agent.node_id ?? "No runtime node"),
    };
  });
}

export function nodeDaemonRuntimeOutcome(
  target: NodeDaemonRuntimeTarget,
  connections: readonly NodeDaemonAgentConnection[],
): NodeDaemonRuntimeOutcome | undefined {
  const connection = connections.find(
    (item) => item.id === target.connectionId,
  );
  if (target.action === "remove") {
    return connection ? undefined : "removed";
  }

  const status = connection?.status;
  if (!status) {
    return undefined;
  }
  if (
    target.desiredGeneration != null &&
    status.observed_generation < target.desiredGeneration
  ) {
    return undefined;
  }
  if (
    target.desiredRestartNonce != null &&
    status.observed_restart_nonce < target.desiredRestartNonce
  ) {
    return undefined;
  }
  if (status.phase === "failed") {
    return "failed";
  }
  if (target.action === "stop") {
    return status.phase === "stopped" ? "stopped" : undefined;
  }
  const expectedPhase = target.expectedPhase ?? "running";
  return status.phase === expectedPhase ? expectedPhase : undefined;
}

function isActiveResource(
  online: boolean | undefined,
  status: string | undefined,
) {
  if (online != null) {
    return online;
  }

  return isActiveStatus(status);
}

function isActiveStatus(status: string | undefined) {
  if (!status) {
    return true;
  }

  const normalized = status.toLowerCase();
  if (inactiveStatuses.has(normalized)) {
    return false;
  }

  return activeStatuses.has(normalized) || !inactiveStatuses.has(normalized);
}

function timestampValue(value: string | undefined) {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}
