import {
  CodePatch,
  coalesceCodePatches,
  extractCodePatches,
  extractCodePatchesWithOptions,
  toolCallMayEditFiles,
} from "./tool-patches";

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
  patches?: CodePatch[];
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
      outputMode?: "append" | "replace";
      patches?: CodePatch[];
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
      type: "turn_done";
      id: string;
      sessionId: string;
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
export type WorkActivityEvent = Extract<
  SessionEvent,
  { type: "progress" | "tool_call" }
>;

export type WorkstreamItem =
  | {
      type: "event";
      id: string;
      event: SessionEvent;
    }
  | {
      type: "work_group";
      id: string;
      sessionId: string;
      createdAt: string;
      complete: boolean;
      events: WorkActivityEvent[];
    }
  | {
      type: "turn_footer";
      id: string;
      sessionId: string;
      createdAt: string;
      actionsContent?: string;
      turnPatches?: CodePatch[];
    };

export function isVisibleTimelineEvent(event: SessionEvent) {
  return (
    event.type !== "run_status" &&
    event.type !== "turn_done" &&
    event.type !== "token_usage" &&
    event.type !== "permission_decision"
  );
}

export function groupWorkstreamEvents(
  events: SessionEvent[],
): WorkstreamItem[] {
  const items: WorkstreamItem[] = [];
  let workGroup: Extract<WorkstreamItem, { type: "work_group" }> | undefined;
  let lastAgentMessage:
    | Extract<SessionEvent, { type: "agent_message" }>
    | undefined;
  let turnPatches: CodePatch[] = [];
  let turnProposedPatches: CodePatch[] = [];
  let turnSessionId = "";
  let turnCreatedAt = "";

  const exposeSingleWorkActivity = () => {
    if (!workGroup || workGroup.events.length !== 1) {
      return false;
    }

    const event = workGroup.events[0];
    const workGroupIndex = items.indexOf(workGroup);
    items[workGroupIndex] = {
      type: "event",
      id: event.id,
      event,
    };
    workGroup = undefined;
    return true;
  };

  const endWorkGroup = () => {
    if (exposeSingleWorkActivity()) {
      return;
    }

    if (!workGroup) {
      return;
    }

    workGroup.complete = true;
    workGroup = undefined;
  };

  const markAgentTurnEnded = () => {
    const patches =
      turnPatches.length > 0
        ? turnPatches
        : coalesceCodePatches(turnProposedPatches);
    if (lastAgentMessage || patches.length > 0) {
      items.push({
        type: "turn_footer",
        id: `turn_footer:${lastAgentMessage?.id ?? patches[0]?.path ?? items.length}`,
        sessionId: lastAgentMessage?.sessionId ?? turnSessionId,
        createdAt: lastAgentMessage?.createdAt ?? turnCreatedAt,
        actionsContent: lastAgentMessage?.content,
        ...(patches.length > 0 ? { turnPatches: patches } : {}),
      });
    }
    lastAgentMessage = undefined;
    turnPatches = [];
    turnProposedPatches = [];
    turnSessionId = "";
    turnCreatedAt = "";
  };

  for (const event of events) {
    if (event.type === "turn_done") {
      endWorkGroup();
      markAgentTurnEnded();
      continue;
    }

    if (!isVisibleTimelineEvent(event)) {
      continue;
    }

    turnSessionId ||= event.sessionId;
    turnCreatedAt ||= event.createdAt;

    if (event.type === "tool_call") {
      const appliedPatches = toolCallAppliedPatches(event);
      if (appliedPatches.length > 0) {
        turnPatches.push(...appliedPatches);
        turnProposedPatches = [];
      } else if (toolCallConfirmsApply(event)) {
        turnPatches.push(...turnProposedPatches);
        turnProposedPatches = [];
      } else {
        turnProposedPatches.push(...toolCallProposedPatches(event));
      }
    }

    if (event.type === "progress" || event.type === "tool_call") {
      if (!workGroup) {
        workGroup = {
          type: "work_group",
          id: `work_group:${event.id}`,
          sessionId: event.sessionId,
          createdAt: event.createdAt,
          complete: false,
          events: [],
        };
        items.push(workGroup);
      }

      workGroup.events.push(event);
      continue;
    }

    if (event.type === "permission_request") {
      turnProposedPatches.push(...permissionRequestCodePatches(event));
    }

    endWorkGroup();
    const item: Extract<WorkstreamItem, { type: "event" }> = {
      type: "event",
      id: event.id,
      event,
    };
    items.push(item);

    if (event.type === "agent_message") {
      lastAgentMessage = event;
    }
  }

  exposeSingleWorkActivity();
  return items;
}

export function toolCallAppliedPatches(event: ToolCallEvent) {
  const includeStringDiffs = toolCallMayEditFiles(event.name);
  const directPatches = coalesceCodePatches([
    ...(event.patches ?? []).filter(
      (patch) =>
        includeStringDiffs ||
        patch.diffText === undefined ||
        patch.operation === "delete",
    ),
    ...extractCodePatchesWithOptions(event.input, "input", {
      includeStringDiffs,
    }),
    ...extractCodePatchesWithOptions(event.output, "output", {
      includeStringDiffs,
    }),
  ]);
  if (directPatches.length > 0) {
    return directPatches;
  }

  const proposedPatches = toolCallProposedPatches(event);
  if (proposedPatches.length > 0 && toolCallConfirmsApply(event)) {
    return proposedPatches;
  }

  return [];
}

export function toolCallProposedPatches(event: ToolCallEvent) {
  return coalesceCodePatches([
    ...(event.permissions ?? []).flatMap(permissionRequestCodePatches),
  ]);
}

export function permissionRequestCodePatches(
  event: Extract<SessionEvent, { type: "permission_request" }>,
) {
  return coalesceCodePatches([
    ...(event.patches ?? []),
    ...extractCodePatches(event.rawInput, "permission"),
  ]);
}

function toolCallConfirmsApply(event: ToolCallEvent) {
  const outputText = textFromPayload(event.output)?.toLowerCase() ?? "";
  const name = event.name.toLowerCase();
  const outputLooksApplied =
    /\b(wrote|written|patched|edited|applied|created|updated)\b/.test(
      outputText,
    );
  const nameLooksEditable = /\b(write|patch|edit)\b/.test(name);

  return outputLooksApplied || (event.status === "done" && nameLooksEditable);
}

function textFromPayload(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const text = value.map(textFromPayload).filter(Boolean).join("\n");
    return text || undefined;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of [
    "text",
    "output",
    "message",
    "description",
    "content",
    "result",
  ]) {
    const text = textFromPayload(record[key]);
    if (text) {
      return text;
    }
  }

  return undefined;
}
