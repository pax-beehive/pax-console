import type { SessionDisplayStatus } from "@/features/runtime/session-display-status";
import type {
  WorkActivityEvent,
  WorkstreamItem,
} from "@/features/runtime/session-events";

type Tool = Extract<WorkActivityEvent, { type: "tool_call" }>;

// Display-only interpretation of normalized events. Never use these labels to
// derive session runtime status or infer thought from the absence of tool work.
export function liveActivityLabel(events: readonly WorkActivityEvent[]) {
  const tools = events.filter(
    (event): event is Tool =>
      event.type === "tool_call" &&
      ["called", "queued", "running"].includes(event.status),
  );
  if (tools.length > 1) {
    const state = tools.every((tool) => tool.status === "running")
      ? "running"
      : tools.every((tool) => tool.status === "queued")
        ? "queued"
        : "active";
    return `Using tools · ${tools.length} ${state}`;
  }
  if (tools.length === 1) {
    const tool = tools[0];
    if (tool.status === "queued") return "Tool queued…";
    if (tool.status === "called") return "Using tools…";
    return toolActivityLabel(tool);
  }
  const latest = events.at(-1);
  return latest?.type === "progress" && latest.streaming
    ? "Thinking…"
    : "Working…";
}

function toolActivityLabel(tool: Tool) {
  const rawName = tool.name.trim().toLowerCase();
  const name = (
    /\s/.test(rawName) ? rawName : (rawName.split(/\.|:|__/).at(-1) ?? rawName)
  ).replace(/[_-]+/g, " ");
  if (/^(run|running) tests?\b/.test(name)) return "Running tests…";
  if (/^(web search|websearch|search web)\b/.test(name))
    return "Searching the web…";
  if (/^(web fetch|webfetch|browse|open url)\b/.test(name)) return "Browsing…";
  if (/^(read|reading|view file)\b/.test(name)) return "Reading files…";
  if (
    /^(edit|editing|apply patch|replace in file|multi edit|multiedit)\b/.test(
      name,
    )
  )
    return "Editing files…";
  if (/^(write|writing|create file)\b/.test(name)) return "Writing files…";
  if (
    /^(grep|glob|search|find files|list files|list directory|ls)\b/.test(name)
  )
    return "Searching…";
  if (/^(update plan|plan)\b/.test(name)) return "Updating plan…";
  if (
    [
      "shell",
      "bash",
      "exec command",
      "execute command",
      "run command",
      "terminal",
    ].includes(name)
  ) {
    return isTestCommand(tool.input) ? "Running tests…" : "Running commands…";
  }
  return "Using tools…";
}

function isTestCommand(input: unknown) {
  if (!input || typeof input !== "object") return false;
  const record = input as Record<string, unknown>;
  const command = record.command ?? record.cmd;
  // Only recognize a direct test command; don't guess from quoted text, scripts,
  // pipelines or compound shell commands containing the word "test".
  if (typeof command !== "string" || /[;&|`\n]/.test(command)) return false;
  return /^(?:(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?test|go\s+test|cargo\s+test|pytest|(?:python3?|uv run python)\s+-m\s+(?:pytest|unittest)|(?:npx\s+)?(?:vitest|jest))(?:\s|$)/.test(
    command.trim(),
  );
}

// Keep feedback visible in the gaps after commentary, not only before the first
// output. Active activity rows already provide their own animation/approval UI.
export function showPendingActivity(
  status: SessionDisplayStatus,
  items: readonly WorkstreamItem[],
) {
  if (status !== "streaming") return false;
  const last = items.at(-1);
  return !(last?.type === "work_group" && !last.complete);
}
