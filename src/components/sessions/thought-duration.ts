import type {
  PermissionRequestEvent,
  WorkActivityEvent,
} from "@/features/runtime/session-events";

/** Use observed activity boundaries without counting tool or approval wait. */
export function thoughtEndAt(
  events: readonly WorkActivityEvent[],
  index: number,
  approvals: readonly PermissionRequestEvent[] = [],
  completedAt?: string,
): string | undefined {
  const thought = events[index];
  if (thought?.type !== "progress") return undefined;
  const started = Date.parse(thought.createdAt);
  if (!Number.isFinite(started)) return undefined;

  const hasTools = events.some((event) => event.type === "tool_call");
  // Older history can aggregate thoughts across an entire turn's tool calls.
  // One stored row cannot tell us how long any individual thought lasted.
  if (
    hasTools &&
    !thought.streaming &&
    thought.sessionUpdate === "agent_thought_chunk" &&
    thought.historyTextLayout !== "segment"
  ) {
    return undefined;
  }

  const next = events[index + 1];
  const candidates: string[] = [];
  if (next) {
    const nextTime = Date.parse(next.createdAt);
    // A missing or reversed direct boundary is not evidence for a later one.
    if (!Number.isFinite(nextTime) || nextTime < started) return undefined;
    candidates.push(next.createdAt);
  } else if (!hasTools && completedAt) {
    candidates.push(completedAt);
  }
  candidates.push(...approvals.map((approval) => approval.createdAt));

  let earliest: string | undefined;
  let earliestTime = Infinity;
  for (const candidate of candidates) {
    const time = Date.parse(candidate);
    if (Number.isFinite(time) && time >= started && time < earliestTime) {
      earliest = candidate;
      earliestTime = time;
    }
  }
  return earliest;
}

export function thoughtDurationLabel(
  startedAt: string,
  endedAt?: string,
): string | undefined {
  if (!endedAt) return undefined;
  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) {
    return undefined;
  }
  return `${Math.round((ended - started) / 100) / 10}s`;
}
