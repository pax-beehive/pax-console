import type { SessionEvent } from "./session-events";

/** A background lifecycle notice, rather than a tool the assistant invoked. */
export function isSubagentCompletion(event: SessionEvent): boolean {
  if (event.type !== "tool_call") return false;

  const input = asRecord(event.input);
  const rawInputKey =
    input && Object.hasOwn(input, "rawInput")
      ? "rawInput"
      : input && Object.hasOwn(input, "raw_input")
        ? "raw_input"
        : undefined;
  if (input && rawInputKey) {
    const activity = asRecord(input[rawInputKey]);
    return (
      activity?.activityKind === "completed" &&
      typeof activity.agentThreadId === "string" &&
      activity.agentThreadId.trim().length > 0
    );
  }

  // Compact history omits raw input. Require both adapter-generated markers;
  // a user-facing tool title alone must never make a real tool transparent.
  return Boolean(
    event.toolCallId?.startsWith("subagent-completed-") &&
    event.toolCallId.length > "subagent-completed-".length &&
    event.name.startsWith("Complete subagent ") &&
    event.name.slice("Complete subagent ".length).trim().length > 0,
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
