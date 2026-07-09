export type PermissionDecision = {
  decisionOption: string;
  source?: "auto" | "user";
  status: "approved" | "denied";
};

export type PermissionRequestEvent = {
  type: "permission_request";
  id: string;
  sessionId: string;
  approvalId?: string;
  description?: string;
  requestId: string;
  title: string;
  toolCallId?: string;
  toolKind?: string;
  rawInput?: unknown;
  options: {
    optionId: string;
    kind?: string;
    name: string;
  }[];
  decision?: PermissionDecision;
  decidedAt?: string;
  createdAt: string;
};

export type SessionEvent =
  | {
      type: "user_message";
      id: string;
      sessionId: string;
      content: string;
      createdAt: string;
    }
  | {
      type: "agent_message";
      id: string;
      sessionId: string;
      content: string;
      streaming?: boolean;
      sessionUpdate?: string;
      createdAt: string;
    }
  | {
      type: "progress";
      id: string;
      sessionId: string;
      content: string;
      streaming?: boolean;
      sessionUpdate?: string;
      createdAt: string;
    }
  | {
      type: "invocation";
      id: string;
      sessionId: string;
      content: string;
      originalContent?: string;
      invocationId?: string;
      invocationType?: string;
      phase?: string;
      state?: "complete" | "pending";
      side?: string;
      parentMessageId?: string;
      replacesMessageIds: string[];
      sender?: {
        agentId?: string;
        agentName?: string;
        representativeAgentId?: string;
        sessionId?: string;
        userName?: string;
      };
      receiver?: {
        agentId?: string;
        agentName?: string;
        representativeAgentId?: string;
        sessionId?: string;
        userName?: string;
      };
      createdAt: string;
    }
  | {
      type: "tool_call";
      id: string;
      sessionId: string;
      name: string;
      status: "called" | "queued" | "running" | "done" | "error";
      sessionUpdate?: string;
      toolCallId?: string;
      permissions?: PermissionRequestEvent[];
      input?: unknown;
      output?: unknown;
      durationMs?: number;
      createdAt: string;
    }
  | {
      type: "file_change";
      id: string;
      sessionId: string;
      path: string;
      tool?: string;
      oldContent?: string;
      newContent?: string;
      createdAt: string;
    }
  | PermissionRequestEvent
  | {
      type: "permission_decision";
      id: string;
      sessionId: string;
      requestId: string;
      decision: PermissionDecision;
      createdAt: string;
    }
  | {
      type: "run_status";
      id: string;
      sessionId: string;
      status: "idle" | "running" | "waiting_approval" | "done" | "error";
      createdAt: string;
    }
  | {
      type: "token_usage";
      id: string;
      sessionId: string;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
      costUsd?: number;
      createdAt: string;
    };

export type SessionEventListener = (event: SessionEvent) => void;

export type ToolCallEvent = Extract<SessionEvent, { type: "tool_call" }>;

export type WorkstreamItem =
  | {
      type: "event";
      id: string;
      event: Exclude<SessionEvent, ToolCallEvent>;
      showActions?: boolean;
    }
  | {
      type: "tool_group";
      id: string;
      sessionId: string;
      createdAt: string;
      events: ToolCallEvent[];
    };

export function isVisibleTimelineEvent(event: SessionEvent) {
  return (
    event.type !== "run_status" &&
    event.type !== "token_usage" &&
    event.type !== "permission_decision"
  );
}

export function groupWorkstreamEvents(
  events: SessionEvent[],
): WorkstreamItem[] {
  const items: WorkstreamItem[] = [];
  let toolGroup: Extract<WorkstreamItem, { type: "tool_group" }> | undefined;
  let lastAgentMessageItem:
    | Extract<WorkstreamItem, { type: "event" }>
    | undefined;

  const markAgentTurnEnded = () => {
    if (lastAgentMessageItem?.event.type === "agent_message") {
      lastAgentMessageItem.showActions = true;
    }
    lastAgentMessageItem = undefined;
  };

  for (const event of events) {
    if (
      event.type === "run_status" &&
      (event.status === "done" || event.status === "error")
    ) {
      markAgentTurnEnded();
      continue;
    }

    if (!isVisibleTimelineEvent(event)) {
      continue;
    }

    if (event.type === "user_message") {
      markAgentTurnEnded();
    }

    if (event.type === "tool_call") {
      if (!toolGroup) {
        toolGroup = {
          type: "tool_group",
          id: `tool_group:${event.id}`,
          sessionId: event.sessionId,
          createdAt: event.createdAt,
          events: [],
        };
        items.push(toolGroup);
      }

      toolGroup.events.push(event);
      continue;
    }

    toolGroup = undefined;
    const item: Extract<WorkstreamItem, { type: "event" }> = {
      type: "event",
      id: event.id,
      event,
    };
    items.push(item);

    if (event.type === "agent_message") {
      lastAgentMessageItem = item;
    }
  }

  markAgentTurnEnded();

  return items;
}
