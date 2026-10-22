import { describe, expect, it } from "vitest";
import { mergeEvents } from "./merge-session-events";
import { normalizeHistoryMessages } from "./normalize-history-message";
import { normalizeTunnelFrame } from "./normalize-tunnel-frame";
import { countRunningSubagents } from "./running-subagents";
import { SessionEvent } from "./session-events";

function liveUpdates(turnId: string, updates: Record<string, unknown>[]) {
  return mergeEvents(
    updates.flatMap((update) =>
      normalizeTunnelFrame({
        jsonrpc: "2.0",
        method: "session/update",
        params: { sessionId: "native", update },
      }).map((event) => ({ ...event, turnId }) as SessionEvent),
    ),
  );
}

// The frame order claude-agent-acp emits for a background Agent call.
const backgroundAgentFrames = [
  {
    sessionUpdate: "tool_call",
    toolCallId: "agent_1",
    title: "Task",
    kind: "think",
    status: "pending",
    rawInput: {},
    _meta: { claudeCode: { toolName: "Agent" } },
  },
  {
    sessionUpdate: "tool_call_update",
    toolCallId: "agent_1",
    title: "Read 5 txt files",
    rawInput: {
      description: "Read 5 txt files",
      subagent_type: "general-purpose",
      run_in_background: true,
    },
    _meta: { claudeCode: { toolName: "Agent" } },
  },
  {
    sessionUpdate: "tool_call_update",
    toolCallId: "agent_1",
    _meta: {
      claudeCode: {
        toolName: "Agent",
        toolResponse: { status: "async_launched", agentId: "a1" },
      },
    },
  },
  {
    sessionUpdate: "tool_call_update",
    toolCallId: "agent_1",
    status: "completed",
    _meta: { claudeCode: { toolName: "Agent" } },
  },
  {
    sessionUpdate: "tool_call",
    toolCallId: "read_1",
    title: "Read file1.txt",
    status: "pending",
    _meta: { claudeCode: { toolName: "Read", parentToolUseId: "agent_1" } },
  },
];

describe("subagent tool calls", () => {
  it("keeps every fact of a background Agent call across its frames", () => {
    const events = liveUpdates("turn_1", backgroundAgentFrames);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      toolCallId: "agent_1",
      status: "done",
      subagent: {
        background: true,
        description: "Read 5 txt files",
        agentType: "general-purpose",
      },
    });
    expect(events[1]).toMatchObject({
      toolCallId: "read_1",
      parentToolCallId: "agent_1",
    });
    expect(events[1]).not.toHaveProperty("subagent");
  });

  it("reads subagent facts from compact history rows", () => {
    const events = normalizeHistoryMessages([
      {
        message_id: "agent",
        session_id: "session",
        turn_id: "turn_1",
        message_type: "tool_call",
        tool: {
          tool_call_id: "agent_1",
          title: "Task",
          status: "completed",
          subagent: { background: true, description: "Read files" },
        },
        has_detail: true,
      },
      {
        message_id: "child",
        session_id: "session",
        turn_id: "turn_1",
        message_type: "tool_call",
        tool: {
          tool_call_id: "read_1",
          title: "Read",
          status: "completed",
          parent_tool_call_id: "agent_1",
        },
        has_detail: true,
      },
    ]);

    expect(events[0]).toMatchObject({
      subagent: { background: true, description: "Read files" },
    });
    expect(events[1]).toMatchObject({ parentToolCallId: "agent_1" });
  });
});

describe("countRunningSubagents", () => {
  it("counts a background subagent while the turn that launched it runs", () => {
    const events = liveUpdates("turn_1", backgroundAgentFrames);

    expect(countRunningSubagents(events, "turn_1")).toBe(1);
    expect(countRunningSubagents(events, "turn_2")).toBe(0);
    expect(countRunningSubagents(events, undefined)).toBe(0);
  });

  it("counts a foreground subagent until its Agent call ends", () => {
    const started = liveUpdates("turn_1", [
      {
        sessionUpdate: "tool_call",
        toolCallId: "agent_1",
        title: "Task",
        status: "pending",
        _meta: { claudeCode: { toolName: "Agent" } },
      },
      {
        sessionUpdate: "tool_call",
        toolCallId: "agent_2",
        title: "Task",
        status: "in_progress",
        _meta: { claudeCode: { toolName: "Task" } },
      },
    ]);
    expect(countRunningSubagents(started, "turn_1")).toBe(2);

    const finished = mergeEvents([
      ...started,
      ...liveUpdates("turn_1", [
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "agent_1",
          status: "completed",
          _meta: { claudeCode: { toolName: "Agent" } },
        },
      ]),
    ]);
    expect(countRunningSubagents(finished, "turn_1")).toBe(1);
  });

  it("does not count the tool calls a subagent makes", () => {
    const events = liveUpdates("turn_1", [
      {
        sessionUpdate: "tool_call",
        toolCallId: "read_1",
        title: "Read",
        status: "in_progress",
        _meta: {
          claudeCode: { toolName: "Agent", parentToolUseId: "agent_0" },
        },
      },
    ]);

    expect(countRunningSubagents(events, "turn_1")).toBe(0);
  });
});
