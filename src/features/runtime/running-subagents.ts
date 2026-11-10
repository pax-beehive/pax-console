import { SessionEvent } from "./session-events";

/**
 * Count direct Codex children across main-agent turns. Tool completion only
 * acknowledges the lifecycle notice; the child's activity determines its state.
 */
export function countActiveCodexSubagents(
  timeline: SessionEvent[],
  sessionId: string,
) {
  const active = new Set<string>();
  const seen = new Set<string>();
  for (const event of timeline) {
    if (
      event.type !== "tool_call" ||
      event.sessionId !== sessionId ||
      !event.codexSubagent
    ) {
      continue;
    }
    const { threadId, activityKind, agentPath } = event.codexSubagent;
    if (agentPath) {
      const path = agentPath.split("/").filter(Boolean);
      if (path.length !== 2 || path[0] !== "root") continue;
    }
    const activityId = event.toolCallId ?? event.id;
    if (seen.has(activityId)) continue;
    seen.add(activityId);

    if (activityKind === "started") {
      active.add(threadId);
    } else if (activityKind === "completed" || activityKind === "interrupted") {
      active.delete(threadId);
    }
  }
  return active.size;
}

/**
 * The subagents of the active turn that are still working.
 *
 * A foreground subagent works until its Agent call ends. A background one
 * works while the turn that launched it runs: claude-agent-acp holds that turn
 * open until its background subagents finish, and reports no earlier end for
 * any one of them.
 */
export function countRunningSubagents(
  timeline: SessionEvent[],
  activeTurnId: string | undefined,
) {
  if (!activeTurnId) {
    return 0;
  }
  let running = 0;
  for (const event of timeline) {
    if (
      event.type !== "tool_call" ||
      !event.subagent ||
      event.turnId !== activeTurnId
    ) {
      continue;
    }
    if (
      event.subagent.background ||
      (event.status !== "done" && event.status !== "error")
    ) {
      running += 1;
    }
  }
  return running;
}
