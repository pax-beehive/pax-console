import {
  CodePatch,
  coalesceCodePatches,
  extractCodePatches,
  extractCodePatchesWithOptions,
  toolCallMayEditFiles,
} from "./tool-patches";

export type TurnTokenUsage = {
  inputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cacheCreationTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  costUsd?: number;
};

export type ContextUsage = {
  usedTokens: number;
  windowTokens?: number;
};

export type ContextCompaction = {
  beforeTokens?: number;
  afterTokens?: number;
  windowTokens?: number;
};

export type PermissionDecision = {
  decisionOption: string;
  source?: "auto" | "user";
  status: "approved" | "denied";
};

export type PermissionRequestEvent = {
  type: "permission_request";
  id: string;
  sessionId: string;
  turnId?: string;
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

export type SessionEvent = (
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
      type: "artifact_publication";
      id: string;
      sessionId: string;
      publicationId: string;
      contentRef: string;
      artifactUri?: string;
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
      contextCompaction?: boolean;
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
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      cacheCreationTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
      costUsd?: number;
      createdAt: string;
    }
  | {
      type: "context_usage";
      id: string;
      sessionId: string;
      usedTokens: number;
      windowTokens?: number;
      createdAt: string;
    }
) & {
  turnId?: string;
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
      turnId?: string;
      actionsContent?: string;
      turnPatches?: CodePatch[];
      tokenUsage?: TurnTokenUsage;
      contextUsage?: ContextUsage;
      contextCompaction?: ContextCompaction;
    };

export function isVisibleTimelineEvent(event: SessionEvent) {
  return (
    event.type !== "run_status" &&
    event.type !== "turn_done" &&
    event.type !== "token_usage" &&
    event.type !== "context_usage" &&
    event.type !== "permission_decision"
  );
}

export function groupWorkstreamEvents(
  events: SessionEvent[],
): WorkstreamItem[] {
  const items: WorkstreamItem[] = [];
  let workGroup: Extract<WorkstreamItem, { type: "work_group" }> | undefined;
  let workGroupTurnKey: string | undefined;
  let activeTurnId: string | undefined;
  const legacyTurnKey = "__legacy_turn__";
  type TurnAccumulator = {
    lastAgentMessage?: Extract<SessionEvent, { type: "agent_message" }>;
    tokenUsage?: TurnTokenUsage;
    contextUsage?: ContextUsage;
    contextCompaction?: ContextCompaction;
    contextCompactionKey?: string;
    awaitingCompactionUsage?: boolean;
    proposedPatches: CodePatch[];
    turnId?: string;
    turnPatches: CodePatch[];
  };
  const turnAccumulators = new Map<string, TurnAccumulator>();

  const accumulatorFor = (turnKey: string): TurnAccumulator => {
    const existing = turnAccumulators.get(turnKey);
    if (existing) {
      return existing;
    }
    const accumulator = {
      proposedPatches: [],
      ...(turnKey !== legacyTurnKey ? { turnId: turnKey } : {}),
      turnPatches: [],
    };
    turnAccumulators.set(turnKey, accumulator);
    return accumulator;
  };

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
    workGroupTurnKey = undefined;
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
    workGroupTurnKey = undefined;
  };

  const markAgentTurnEnded = (
    turnKey: string,
    doneEvent: Extract<SessionEvent, { type: "turn_done" }>,
  ) => {
    const accumulator = turnAccumulators.get(turnKey);
    if (!accumulator) {
      return;
    }
    const patches =
      accumulator.turnPatches.length > 0
        ? accumulator.turnPatches
        : coalesceCodePatches(accumulator.proposedPatches);
    if (
      accumulator.lastAgentMessage ||
      patches.length > 0 ||
      accumulator.tokenUsage ||
      accumulator.contextUsage ||
      accumulator.contextCompaction
    ) {
      items.push({
        type: "turn_footer",
        id: `turn_footer:${accumulator.lastAgentMessage?.id ?? patches[0]?.path ?? items.length}`,
        sessionId: doneEvent.sessionId,
        createdAt: doneEvent.createdAt,
        ...(accumulator.turnId ? { turnId: accumulator.turnId } : {}),
        actionsContent: accumulator.lastAgentMessage?.content,
        ...(patches.length > 0 ? { turnPatches: patches } : {}),
        ...(accumulator.tokenUsage
          ? { tokenUsage: accumulator.tokenUsage }
          : {}),
        ...(accumulator.contextUsage
          ? { contextUsage: accumulator.contextUsage }
          : {}),
        ...(accumulator.contextCompaction
          ? { contextCompaction: accumulator.contextCompaction }
          : {}),
      });
    }
    turnAccumulators.delete(turnKey);
  };

  for (const event of events) {
    if (event.type === "turn_done") {
      const turnKey = event.turnId ?? activeTurnId ?? legacyTurnKey;
      if (workGroupTurnKey === turnKey) {
        endWorkGroup();
      }
      markAgentTurnEnded(turnKey, event);
      if (!event.turnId || activeTurnId === event.turnId) {
        activeTurnId = undefined;
      }
      continue;
    }

    const turnKey = event.turnId ?? activeTurnId ?? legacyTurnKey;
    if (event.turnId) {
      activeTurnId = event.turnId;
    }

    if (event.type === "token_usage") {
      accumulatorFor(turnKey).tokenUsage = {
        inputTokens: event.inputTokens,
        cacheReadTokens: event.cacheReadTokens,
        cacheWriteTokens: event.cacheWriteTokens,
        cacheCreationTokens: event.cacheCreationTokens,
        outputTokens: event.outputTokens,
        reasoningTokens: event.reasoningTokens,
        totalTokens: event.totalTokens,
        costUsd: event.costUsd,
      };
      continue;
    }

    if (event.type === "context_usage") {
      const accumulator = accumulatorFor(turnKey);
      accumulator.contextUsage = {
        usedTokens: event.usedTokens,
        windowTokens: event.windowTokens,
      };
      if (
        accumulator.contextCompaction &&
        accumulator.awaitingCompactionUsage
      ) {
        accumulator.contextCompaction = {
          ...accumulator.contextCompaction,
          afterTokens: event.usedTokens,
          windowTokens:
            event.windowTokens ?? accumulator.contextCompaction.windowTokens,
        };
        accumulator.awaitingCompactionUsage = false;
      }
      continue;
    }

    if (!isVisibleTimelineEvent(event)) {
      continue;
    }

    if (workGroup && workGroupTurnKey !== turnKey) {
      endWorkGroup();
    }
    const accumulator = accumulatorFor(turnKey);

    if (event.type === "tool_call") {
      if (event.contextCompaction) {
        const compactionKey = event.toolCallId ?? event.id;
        if (accumulator.contextCompactionKey !== compactionKey) {
          accumulator.contextCompactionKey = compactionKey;
          accumulator.contextCompaction = {
            beforeTokens: accumulator.contextUsage?.usedTokens,
            windowTokens: accumulator.contextUsage?.windowTokens,
          };
          accumulator.awaitingCompactionUsage = true;
        }
      }
      const appliedPatches = toolCallAppliedPatches(event);
      if (appliedPatches.length > 0) {
        accumulator.turnPatches.push(...appliedPatches);
        accumulator.proposedPatches = [];
      } else if (toolCallConfirmsApply(event)) {
        accumulator.turnPatches.push(...accumulator.proposedPatches);
        accumulator.proposedPatches = [];
      } else {
        accumulator.proposedPatches.push(...toolCallProposedPatches(event));
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
        workGroupTurnKey = turnKey;
      }

      workGroup.events.push(event);
      continue;
    }

    if (event.type === "permission_request") {
      accumulator.proposedPatches.push(...permissionRequestCodePatches(event));
    }

    endWorkGroup();
    const item: Extract<WorkstreamItem, { type: "event" }> = {
      type: "event",
      id: event.id,
      event,
    };
    items.push(item);

    if (event.type === "agent_message") {
      accumulator.lastAgentMessage = event;
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
