import { translators, type Translator } from "@/features/i18n/translate";
import type { SessionDisplayStatus } from "@/features/runtime/session-display-status";
import type {
  WorkActivityEvent,
  WorkstreamItem,
} from "@/features/runtime/session-events";

type Tool = Extract<WorkActivityEvent, { type: "tool_call" }>;

// Display-only interpretation of normalized events. Never use these labels to
// derive session runtime status or infer thought from the absence of tool work.
export function liveActivityLabel(
  events: readonly WorkActivityEvent[],
  t: Translator = translators.en,
) {
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
    return t(
      state === "running"
        ? "Using tools · {count} running"
        : state === "queued"
          ? "Using tools · {count} queued"
          : "Using tools · {count} active",
      { count: tools.length },
    );
  }
  if (tools.length === 1) {
    const tool = tools[0];
    if (tool.status === "queued") return t("Tool queued…");
    if (tool.status === "called") return t("Using tools…");
    return toolActivityLabel(tool, t);
  }
  const latest = events.at(-1);
  return latest?.type === "progress" && latest.streaming
    ? t("Thinking…")
    : t("Working…");
}

function toolActivityLabel(tool: Tool, t: Translator) {
  const rawName = tool.name.trim().toLowerCase();
  const name = (
    /\s/.test(rawName) ? rawName : (rawName.split(/\.|:|__/).at(-1) ?? rawName)
  ).replace(/[_-]+/g, " ");
  if (/^(run|running) tests?\b/.test(name)) return t("Running tests…");
  if (/^(web search|websearch|search web)\b/.test(name))
    return t("Searching the web…");
  if (/^(web fetch|webfetch|browse|open url)\b/.test(name))
    return t("Browsing…");
  if (/^(read|reading|view file)\b/.test(name)) return t("Reading files…");
  if (
    /^(edit|editing|apply patch|replace in file|multi edit|multiedit)\b/.test(
      name,
    )
  )
    return t("Editing files…");
  if (/^(write|writing|create file)\b/.test(name)) return t("Writing files…");
  if (
    /^(grep|glob|search|find files|list files|list directory|ls)\b/.test(name)
  )
    return t("Searching…");
  if (/^(update plan|plan)\b/.test(name)) return t("Updating plan…");
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
    return isTestCommand(tool.input)
      ? t("Running tests…")
      : t("Running commands…");
  }
  return t("Using tools…");
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
