import { SessionEvent } from "./session-events";

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
