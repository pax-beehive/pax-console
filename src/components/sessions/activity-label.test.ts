import { describe, expect, it } from "vitest";
import type {
  WorkActivityEvent,
  WorkstreamItem,
} from "@/features/runtime/session-events";
import { liveActivityLabel, showPendingActivity } from "./activity-label";
const thought: WorkActivityEvent = {
  type: "progress",
  id: "thought",
  sessionId: "s",
  content: "Checking",
  streaming: true,
  sessionUpdate: "agent_thought_chunk",
  createdAt: "2026-09-25T00:00:00Z",
};
const tool = (
  name: string,
  status: "running" | "queued" | "called" | "done" | "error" = "running",
  input?: unknown,
): WorkActivityEvent => ({
  type: "tool_call",
  id: name,
  sessionId: "s",
  name,
  status,
  input,
  createdAt: "2026-09-25T00:00:01Z",
});
describe("live activity labels", () => {
  it("distinguishes live thought from a gap after tools or an old thought", () => {
    expect(liveActivityLabel([thought])).toBe("Thinking…");
    expect(liveActivityLabel([{ ...thought, streaming: false }])).toBe(
      "Working…",
    );
    expect(liveActivityLabel([thought, tool("Read", "done")])).toBe("Working…");
    expect(liveActivityLabel([thought, tool("Read", "error")])).toBe(
      "Working…",
    );
    expect(liveActivityLabel([tool("Read", "done"), thought])).toBe(
      "Thinking…",
    );
  });
  it.each([
    ["Read", "Reading files…"],
    ["Read upload handler", "Reading files…"],
    ["functions.read_file", "Reading files…"],
    ["Edit", "Editing files…"],
    ["write_file", "Writing files…"],
    ["Grep", "Searching…"],
    ["WebSearch", "Searching the web…"],
    ["Run tests", "Running tests…"],
    ["shell", "Running commands…"],
    ["unknown-mcp-action", "Using tools…"],
  ])("describes %s without exposing its raw name", (name, label) =>
    expect(liveActivityLabel([tool(name)])).toBe(label),
  );
  it("uses explicit test commands only for known command tools", () => {
    expect(
      liveActivityLabel([tool("shell", "running", { command: "pnpm test" })]),
    ).toBe("Running tests…");
    expect(
      liveActivityLabel([
        tool("exec_command", "running", { cmd: "go test ./..." }),
      ]),
    ).toBe("Running tests…");
    expect(
      liveActivityLabel([
        tool("shell", "running", { command: 'echo "pnpm test"' }),
      ]),
    ).toBe("Running commands…");
    expect(
      liveActivityLabel([tool("unknown", "running", { command: "pnpm test" })]),
    ).toBe("Using tools…");
  });
  it("counts simultaneous work without claiming queued tools are running", () => {
    expect(liveActivityLabel([tool("Read"), tool("Grep"), tool("shell")])).toBe(
      "Using tools · 3 running",
    );
    expect(liveActivityLabel([tool("Read"), tool("Grep", "queued")])).toBe(
      "Using tools · 2 active",
    );
    expect(
      liveActivityLabel([tool("Read", "queued"), tool("Grep", "queued")]),
    ).toBe("Using tools · 2 queued");
    expect(liveActivityLabel([tool("Read", "queued")])).toBe("Tool queued…");
    expect(liveActivityLabel([tool("Read", "called")])).toBe("Using tools…");
  });
});

describe("pending activity indicator", () => {
  const reply: WorkstreamItem = {
    type: "event",
    id: "reply",
    event: {
      type: "agent_message",
      id: "reply",
      sessionId: "s",
      content: "I will check the files.",
      createdAt: "2026-09-25T00:00:00Z",
    },
  };
  const activity: WorkstreamItem = {
    type: "work_group",
    id: "work",
    sessionId: "s",
    createdAt: "2026-09-25T00:00:00Z",
    complete: false,
    events: [tool("Read", "called")],
  };
  it("continues showing a wait indicator after commentary, before a tool starts", () => {
    expect(showPendingActivity("streaming", [])).toBe(true);
    expect(showPendingActivity("streaming", [reply])).toBe(true);
    expect(
      showPendingActivity("streaming", [
        { ...activity, complete: true },
        reply,
      ]),
    ).toBe(true);
  });
  it("does not duplicate an already animated activity row", () => {
    expect(showPendingActivity("streaming", [reply, activity])).toBe(false);
    expect(
      showPendingActivity("streaming", [{ ...activity, complete: true }]),
    ).toBe(true);
  });
  it.each([
    "idle",
    "done",
    "cancelled",
    "error",
    "waiting_approval",
    "unknown",
  ] as const)("hides the indicator for %s", (status) => {
    expect(showPendingActivity(status, [reply])).toBe(false);
  });
});
