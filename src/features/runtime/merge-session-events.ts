import { SessionEvent } from "./session-events";
import { reconcilePermissionDecisions } from "./permission-decisions";
import { CodePatch, coalesceCodePatches } from "./tool-patches";
import { mergeToolCallOutput, textFromToolPayload } from "./tool-call-output";

export function mergeEvents(events: SessionEvent[]) {
  // REST history and tunnel notifications can overlap. Keep replacement-style
  // events keyed. ACP text chunk sessionUpdates append only while the previous
  // visible event is the same chunk stream; visible tool/message events split
  // the stream into separate timeline blocks.
  const merged: SessionEvent[] = [];
  const indexByKey = new Map<string, number>();
  const lastTextChunkIndexByKey = new Map<string, number>();
  const streamSegmentCounts = new Map<string, number>();
  const hiddenEventIds = new Set<string>();

  for (const event of events) {
    if (hiddenEventIds.has(event.id)) {
      continue;
    }

    const eventKey = eventMergeKey(event);

    if (event.type === "run_status") {
      closeOpenToolCallsForRunStatus(merged, event.status);
    }

    if (event.type === "turn_done") {
      closeOpenToolCallsForRunStatus(merged, "done");
    }

    if (event.type === "invocation") {
      for (const hiddenId of invocationHiddenEventIds(event)) {
        hiddenEventIds.add(hiddenId);
      }

      const replacementIndex = invocationReplacementIndex(merged, event);
      if (replacementIndex >= 0) {
        merged[replacementIndex] = event;
        indexByKey.set(eventKey, replacementIndex);
        continue;
      }
    }

    if (isContiguousTextChunk(event)) {
      const chunkKey = chunkMergeKey(event);
      const previousChunkIndex = lastTextChunkIndexByKey.get(chunkKey);
      const previousChunk =
        previousChunkIndex === undefined
          ? undefined
          : merged[previousChunkIndex];
      const previousVisible = lastVisibleEvent(merged);

      if (
        previousChunk &&
        previousChunk === previousVisible &&
        previousChunk.type === event.type &&
        isContiguousTextChunk(previousChunk)
      ) {
        merged[previousChunkIndex!] = {
          ...event,
          content: `${previousChunk.content}${event.content}`,
          createdAt: previousChunk.createdAt,
          id: previousChunk.id,
        };
        continue;
      }

      const segment = segmentStreamingEvent(event, streamSegmentCounts);
      lastTextChunkIndexByKey.set(chunkKey, merged.length);
      merged.push(segment);
      continue;
    }

    const existingIndex = indexByKey.get(eventKey);
    const existing =
      existingIndex === undefined ? undefined : merged[existingIndex];

    if (
      existing?.type === "permission_request" &&
      event.type === "permission_decision"
    ) {
      merged[existingIndex!] = {
        ...existing,
        decision: event.decision,
        decidedAt: event.createdAt,
      };
      continue;
    }

    if (
      existing?.type === "permission_decision" &&
      event.type === "permission_request"
    ) {
      merged[existingIndex!] = {
        ...event,
        decision: existing.decision,
        decidedAt: existing.createdAt,
      };
      continue;
    }

    if (
      existing?.type === "permission_request" &&
      event.type === "permission_request"
    ) {
      merged[existingIndex!] = {
        ...existing,
        ...event,
        approvalId: event.approvalId ?? existing.approvalId,
        decision: event.decision ?? existing.decision,
        decidedAt: event.decidedAt ?? existing.decidedAt,
      };
      continue;
    }

    if (existing?.type === "tool_call" && event.type === "tool_call") {
      merged[existingIndex!] = mergeToolCallEvent(existing, event);
      continue;
    }

    if (existingIndex !== undefined) {
      merged[existingIndex] = {
        ...event,
        createdAt: existing?.createdAt ?? event.createdAt,
      } as SessionEvent;
      continue;
    }

    indexByKey.set(eventKey, merged.length);
    merged.push(event);
  }

  return reconcilePermissionDecisions(
    attachAdjacentPermissionsToTools(
      merged.filter((event) => !hiddenEventIds.has(event.id)),
    ),
  );
}

function invocationHiddenEventIds(
  event: Extract<SessionEvent, { type: "invocation" }>,
) {
  if (event.replacesMessageIds.length > 0) {
    return event.replacesMessageIds;
  }

  return event.parentMessageId ? [event.parentMessageId] : [];
}

function invocationReplacementIndex(
  events: SessionEvent[],
  event: Extract<SessionEvent, { type: "invocation" }>,
) {
  const replacedIndex = events.findIndex((candidate) =>
    event.replacesMessageIds.includes(candidate.id),
  );
  if (replacedIndex >= 0) {
    return replacedIndex;
  }

  return event.parentMessageId
    ? events.findIndex((candidate) => candidate.id === event.parentMessageId)
    : -1;
}

function closeOpenToolCallsForRunStatus(
  events: SessionEvent[],
  status: Extract<SessionEvent, { type: "run_status" }>["status"],
) {
  if (status !== "done" && status !== "error") {
    return;
  }

  const nextStatus = status === "done" ? "done" : "error";
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (
      event.type === "tool_call" &&
      (event.status === "queued" || event.status === "running")
    ) {
      events[index] = {
        ...event,
        status: nextStatus,
      };
    }
  }
}

function mergeToolCallEvent(
  existing: Extract<SessionEvent, { type: "tool_call" }>,
  event: Extract<SessionEvent, { type: "tool_call" }>,
) {
  return {
    ...existing,
    ...event,
    createdAt: existing.createdAt,
    id: existing.id,
    historyDetails:
      existing.historyDetails || event.historyDetails
        ? [
            ...new Map(
              [
                ...(existing.historyDetails ?? []),
                ...(event.historyDetails ?? []),
              ].map((detail) => [detail.messageId, detail]),
            ).values(),
          ]
        : undefined,
    status:
      event.historyDetails &&
      existing.historyDetails &&
      ["done", "error"].includes(existing.status) &&
      !["done", "error"].includes(event.status)
        ? existing.status
        : event.status,
    input: mergeToolPayload(existing, event, "input"),
    name: existing.name || event.name,
    output: mergeToolCallOutput(
      existing.output,
      event.output,
      event.outputMode ??
        (event.sessionUpdate === "tool_call_content_chunk"
          ? "append"
          : "replace"),
    ),
    outputMode: event.outputMode ?? existing.outputMode,
    patches: mergeCodePatches(existing.patches, event.patches),
    permissions: mergePermissionLists(existing.permissions, event.permissions),
    sessionId: existing.sessionId,
    toolCallId: existing.toolCallId ?? event.toolCallId,
  } satisfies SessionEvent;
}

function mergeToolPayload(
  existing: Extract<SessionEvent, { type: "tool_call" }>,
  event: Extract<SessionEvent, { type: "tool_call" }>,
  field: "input" | "output",
) {
  const incoming = event[field];
  if (incoming === undefined) {
    return existing[field];
  }

  if (event.sessionUpdate !== "tool_call_content_chunk") {
    return incoming;
  }

  const current = existing[field];
  if (current === undefined) {
    return incoming;
  }

  if (existing.sessionUpdate !== "tool_call_content_chunk") {
    return incoming;
  }

  return appendPayloadText(current, incoming) ?? incoming;
}

function appendPayloadText(current: unknown, incoming: unknown) {
  const currentText = textFromToolPayload(current);
  const incomingText = textFromToolPayload(incoming);
  if (currentText === undefined || incomingText === undefined) {
    return undefined;
  }

  return `${currentText}${incomingText}`;
}

function attachAdjacentPermissionsToTools(events: SessionEvent[]) {
  const attached: SessionEvent[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.type !== "tool_call") {
      attached.push(event);
      continue;
    }

    const permissions = [...(event.permissions ?? [])];
    let nextIndex = index + 1;
    while (
      events[nextIndex]?.type === "permission_request" &&
      shouldAttachPermissionToTool(
        event,
        events[nextIndex] as Extract<
          SessionEvent,
          { type: "permission_request" }
        >,
      )
    ) {
      permissions.push(
        events[nextIndex] as Extract<
          SessionEvent,
          { type: "permission_request" }
        >,
      );
      nextIndex += 1;
    }

    const mergedPermissions = mergePermissionLists(
      event.permissions,
      permissions,
    );
    attached.push(
      mergedPermissions
        ? {
            ...event,
            permissions: settleImplicitAutoApprovals(event, mergedPermissions),
          }
        : event,
    );
    index = nextIndex - 1;
  }

  return attached;
}

function settleImplicitAutoApprovals(
  tool: Extract<SessionEvent, { type: "tool_call" }>,
  permissions: NonNullable<
    Extract<SessionEvent, { type: "tool_call" }>["permissions"]
  >,
) {
  if (tool.sessionUpdate !== "tool_call_update" || tool.status === "error") {
    return permissions;
  }

  return permissions.map((permission) =>
    permission.decision
      ? permission
      : {
          ...permission,
          decision: {
            decisionOption: "auto_approved",
            source: "auto" as const,
            status: "approved" as const,
          },
          decidedAt: tool.createdAt,
        },
  );
}

function shouldAttachPermissionToTool(
  tool: Extract<SessionEvent, { type: "tool_call" }>,
  permission: Extract<SessionEvent, { type: "permission_request" }>,
) {
  if (tool.turnId && permission.turnId && tool.turnId !== permission.turnId) {
    return false;
  }

  if (!tool.toolCallId || !permission.toolCallId) {
    return true;
  }
  if (tool.toolCallId === permission.toolCallId) {
    return true;
  }

  const toolText = normalizedToolText(tool.name);
  const permissionText = normalizedToolText(permission.title);
  return Boolean(toolText && permissionText.includes(toolText));
}

function normalizedToolText(value: string) {
  return value
    .toLowerCase()
    .replace(/^terminal:\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mergePermissionLists(
  existing:
    | Extract<SessionEvent, { type: "tool_call" }>["permissions"]
    | undefined,
  incoming:
    | Extract<SessionEvent, { type: "tool_call" }>["permissions"]
    | undefined,
) {
  const byKey = new Map<
    string,
    Extract<SessionEvent, { type: "permission_request" }>
  >();
  for (const permission of [...(existing ?? []), ...(incoming ?? [])]) {
    const key = `${turnScope(permission)}:${permission.sessionId}:${permission.requestId}`;
    const previous = byKey.get(key);
    byKey.set(
      key,
      previous
        ? {
            ...previous,
            ...permission,
            decision: permission.decision ?? previous.decision,
            patches: mergeCodePatches(previous.patches, permission.patches),
          }
        : permission,
    );
  }

  return byKey.size > 0 ? [...byKey.values()] : undefined;
}

function mergeCodePatches(
  existing: CodePatch[] | undefined,
  incoming: CodePatch[] | undefined,
) {
  const patches = coalesceCodePatches([
    ...(existing ?? []),
    ...(incoming ?? []),
  ]);
  return patches.length > 0 ? patches : undefined;
}

function lastVisibleEvent(events: SessionEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (
      event.type !== "run_status" &&
      event.type !== "turn_done" &&
      event.type !== "token_usage" &&
      event.type !== "context_usage"
    ) {
      return event;
    }
  }

  return undefined;
}

function eventMergeKey(event: SessionEvent) {
  if (event.type === "tool_call" && event.toolCallId) {
    return `${turnScope(event)}:tool:${event.toolCallId}`;
  }

  if (event.type === "permission_request") {
    return `${turnScope(event)}:permission:${event.sessionId}:${event.requestId}`;
  }

  if (event.type === "permission_decision") {
    return `${turnScope(event)}:permission:${event.sessionId}:${event.requestId}`;
  }

  return event.id;
}

function chunkMergeKey(event: TextChunkEvent) {
  return `${turnScope(event)}:${event.sessionUpdate ?? event.type}:${streamingEventBaseId(event.id)}`;
}

function turnScope(event: SessionEvent) {
  return event.turnId ? `turn:${event.turnId}` : "turn:legacy";
}

function streamingEventBaseId(id: string) {
  return id.replace(/:segment:\d+$/, "");
}

function segmentStreamingEvent(
  event: TextChunkEvent,
  segmentCounts: Map<string, number>,
) {
  const key = chunkMergeKey(event);
  const baseId = streamingEventBaseId(event.id);
  const count = segmentCounts.get(key) ?? 0;
  segmentCounts.set(key, count + 1);

  if (count === 0) {
    return event.id === baseId ? event : { ...event, id: baseId };
  }

  return {
    ...event,
    id: `${baseId}:segment:${count}`,
  } satisfies SessionEvent;
}

type TextChunkEvent = Extract<
  SessionEvent,
  { type: "agent_message" | "progress" }
>;

function isContiguousTextChunk(event: SessionEvent): event is TextChunkEvent {
  return (
    (event.type === "agent_message" &&
      event.streaming === true &&
      (event.sessionUpdate === "agent_message_chunk" ||
        event.sessionUpdate === undefined)) ||
    (event.type === "progress" &&
      event.streaming === true &&
      event.sessionUpdate === "agent_thought_chunk")
  );
}
