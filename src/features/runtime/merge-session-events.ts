import { SessionEvent } from "./session-events";

export function mergeEvents(events: SessionEvent[]) {
  // REST history and tunnel notifications can overlap. Keep replacement-style
  // events keyed. ACP text chunk sessionUpdates append only while the previous
  // visible event is the same chunk stream; visible tool/message events split
  // the stream into separate timeline blocks.
  const merged: SessionEvent[] = [];
  const indexByKey = new Map<string, number>();
  const lastTextChunkIndexByKey = new Map<string, number>();
  const streamSegmentCounts = new Map<string, number>();

  for (const event of events) {
    const eventKey = eventMergeKey(event);

    if (event.type === "run_status") {
      closeOpenToolCallsForRunStatus(merged, event.status);
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

  return attachAdjacentPermissionsToTools(merged);
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
    input: event.input ?? existing.input,
    name: existing.name || event.name,
    output: event.output ?? existing.output,
    permissions: mergePermissionLists(existing.permissions, event.permissions),
    sessionId: existing.sessionId,
    toolCallId: existing.toolCallId ?? event.toolCallId,
  } satisfies SessionEvent;
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
    while (events[nextIndex]?.type === "permission_request") {
      permissions.push(
        events[nextIndex] as Extract<SessionEvent, { type: "permission_request" }>,
      );
      nextIndex += 1;
    }

    attached.push(
      permissions.length > 0
        ? {
            ...event,
            permissions: mergePermissionLists(event.permissions, permissions),
          }
        : event,
    );
    index = nextIndex - 1;
  }

  return attached;
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
    byKey.set(
      `${permission.sessionId}:${permission.requestId}`,
      byKey.get(`${permission.sessionId}:${permission.requestId}`)
        ? {
            ...byKey.get(`${permission.sessionId}:${permission.requestId}`)!,
            ...permission,
            decision:
              permission.decision ??
              byKey.get(`${permission.sessionId}:${permission.requestId}`)!
                .decision,
          }
        : permission,
    );
  }

  return byKey.size > 0 ? [...byKey.values()] : undefined;
}

function lastVisibleEvent(events: SessionEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type !== "run_status" && event.type !== "token_usage") {
      return event;
    }
  }

  return undefined;
}

function eventMergeKey(event: SessionEvent) {
  if (event.type === "tool_call" && event.toolCallId) {
    return `tool:${event.toolCallId}`;
  }

  if (event.type === "permission_request") {
    return `permission:${event.sessionId}:${event.requestId}`;
  }

  if (event.type === "permission_decision") {
    return `permission:${event.sessionId}:${event.requestId}`;
  }

  return event.id;
}

function chunkMergeKey(event: TextChunkEvent) {
  return `${event.sessionUpdate ?? event.type}:${event.id}`;
}

function segmentStreamingEvent(
  event: TextChunkEvent,
  segmentCounts: Map<string, number>,
) {
  const key = chunkMergeKey(event);
  const count = segmentCounts.get(key) ?? 0;
  segmentCounts.set(key, count + 1);

  if (count === 0) {
    return event;
  }

  return {
    ...event,
    id: `${event.id}:segment:${count}`,
  } satisfies SessionEvent;
}

type TextChunkEvent = Extract<
  SessionEvent,
  { type: "agent_message" | "progress" }
>;

function isContiguousTextChunk(event: SessionEvent): event is TextChunkEvent {
  return (
    ((event.type === "agent_message" &&
      event.streaming === true &&
      (event.sessionUpdate === "agent_message_chunk" ||
        event.sessionUpdate === undefined)) ||
      (event.type === "progress" &&
        event.streaming === true &&
        event.sessionUpdate === "agent_thought_chunk"))
  );
}
