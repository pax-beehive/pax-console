import { describe, expect, it } from "vitest";
import { mergeEvents } from "./merge-session-events";
import { normalizeHistoryMessages } from "./normalize-history-message";
import { normalizeTunnelFrame } from "./normalize-tunnel-frame";
import { countActiveCodexSubagents } from "./running-subagents";
import { SessionEvent } from "./session-events";

type ActivityOptions = {
  sessionId?: string;
  turnId?: string;
  threadId?: unknown;
  agentPath?: string;
};

function activityFrame(
  toolCallId: string,
  activityKind: string,
  {
    sessionId = "session",
    threadId = "child-a",
    agentPath = "/root/worker",
  }: ActivityOptions = {},
) {
  return {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId,
        title: "Subagent activity",
        kind: "other",
        status: "in_progress",
        rawInput: { activityKind, agentThreadId: threadId, agentPath },
      },
    },
  };
}

function activity(
  toolCallId: string,
  activityKind: string,
  options: ActivityOptions = {},
): SessionEvent[] {
  return normalizeTunnelFrame(
    activityFrame(toolCallId, activityKind, options),
    { createdAt: "2026-11-09T12:00:00.000Z" },
  ).map((event) => ({ ...event, turnId: options.turnId ?? "turn_1" }));
}

function count(events: SessionEvent[], sessionId = "session") {
  return countActiveCodexSubagents(mergeEvents(events), sessionId);
}

describe("Codex subagent activity normalization", () => {
  it("accepts the raw_input alias and normalizes lifecycle identifiers", () => {
    const events = normalizeTunnelFrame({
      session_id: "session",
      sessionUpdate: "tool_call",
      toolCallId: "start-a",
      rawInput: null,
      raw_input: {
        activityKind: " started ",
        agentThreadId: " child-a ",
      },
    });

    expect(events[0]).toMatchObject({
      codexSubagent: { threadId: "child-a", activityKind: "started" },
    });
    expect(count(events)).toBe(1);
  });

  it("retains the child identity and lifecycle separately from tool status", () => {
    const events = mergeEvents([
      ...activity("start-a", "started"),
      ...normalizeTunnelFrame({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "session",
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "start-a",
            status: "completed",
          },
        },
      }).map((event) => ({ ...event, turnId: "turn_1" })),
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_call",
      status: "done",
      codexSubagent: { threadId: "child-a", activityKind: "started" },
    });
    expect(countActiveCodexSubagents(events, "session")).toBe(1);
  });

  it("restores lifecycle activity from legacy raw ACP history frames", () => {
    const messages = [
      { toolCallId: "start-a", kind: "started", threadId: "child-a" },
      { toolCallId: "start-b", kind: "started", threadId: "child-b" },
      { toolCallId: "finish-a", kind: "completed", threadId: "child-a" },
    ].map(({ toolCallId, kind, threadId }, index) => ({
      message_id: `history-${index}`,
      session_id: "pax-session",
      turn_id: "turn_1",
      message_type: "tool_call",
      created_at: `2026-11-09T12:00:0${index}.000Z`,
      raw_json: activityFrame(toolCallId, kind, {
        sessionId: "native-session",
        threadId,
      }),
    }));
    const events = mergeEvents(normalizeHistoryMessages(messages));

    expect(countActiveCodexSubagents(events, "pax-session")).toBe(1);
    expect(countActiveCodexSubagents(events, "native-session")).toBe(0);
    expect(
      countActiveCodexSubagents(
        mergeEvents([...events, ...normalizeHistoryMessages(messages)]),
        "pax-session",
      ),
    ).toBe(1);
  });

  it("restores compact lifecycle rows and preserves facts through status-only updates", () => {
    const events = mergeEvents(
      normalizeHistoryMessages([
        {
          message_id: "start-a",
          session_id: "session",
          turn_id: "turn_1",
          message_type: "tool_call",
          tool: {
            tool_call_id: "start-a",
            title: "Subagent activity",
            status: "in_progress",
            codex_subagent: {
              thread_id: "child-a",
              activity_kind: "started",
              agent_path: "/root/worker",
            },
          },
          has_detail: true,
        },
        {
          message_id: "start-operation-done",
          session_id: "session",
          turn_id: "turn_1",
          message_type: "tool_call_update",
          tool: {
            tool_call_id: "start-a",
            title: "Subagent activity",
            status: "completed",
          },
          has_detail: true,
        },
      ]),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "done",
      codexSubagent: { threadId: "child-a", activityKind: "started" },
    });
    expect(countActiveCodexSubagents(events, "session")).toBe(1);

    const completed = normalizeHistoryMessages([
      {
        message_id: "finish-a",
        session_id: "session",
        turn_id: "turn_2",
        message_type: "tool_call",
        tool: {
          tool_call_id: "finish-a",
          title: "Subagent activity",
          status: "completed",
          codex_subagent: {
            thread_id: "child-a",
            activity_kind: "completed",
            agent_path: "/root/worker",
          },
        },
        has_detail: true,
      },
    ]);

    expect(count([...events, ...completed])).toBe(0);
  });
});

describe("countActiveCodexSubagents", () => {
  it("counts each active direct child once across calls and turns", () => {
    const events = [
      ...activity("start-a", "started"),
      ...activity("start-b", "started", {
        threadId: "child-b",
        turnId: "turn_2",
      }),
      ...activity("start-a-again", "started", { turnId: "turn_2" }),
      ...activity("message-a", "interacted", { turnId: "turn_2" }),
    ];

    expect(count(events)).toBe(2);
  });

  it.each(["completed", "interrupted"])(
    "removes only the matching child on a %s activity update",
    (activityKind) => {
      const events = [
        ...activity("start-a", "started"),
        ...activity("start-b", "started", { threadId: "child-b" }),
        ...activity("finish-a", activityKind, { turnId: "turn_2" }),
      ];

      expect(count(events)).toBe(1);
      expect(
        count([
          ...events,
          ...activity("finish-b", activityKind, { threadId: "child-b" }),
        ]),
      ).toBe(0);
    },
  );

  it("keeps child activity independent of main turn completion and status", () => {
    const events: SessionEvent[] = [
      ...activity("start-a", "started"),
      {
        type: "turn_done",
        id: "turn_1:done",
        sessionId: "session",
        turnId: "turn_1",
        createdAt: "2026-11-09T12:00:01.000Z",
      },
      {
        type: "run_status",
        id: "main-idle",
        sessionId: "session",
        status: "idle",
        createdAt: "2026-11-09T12:00:02.000Z",
      },
      {
        type: "run_status",
        id: "main-error",
        sessionId: "session",
        status: "error",
        createdAt: "2026-11-09T12:00:03.000Z",
      },
    ];

    expect(count(events)).toBe(1);
    expect(
      count([
        ...events,
        ...activity("finish-a", "completed", { turnId: "turn_2" }),
      ]),
    ).toBe(0);
  });

  it("isolates child identities and lifecycle updates by session", () => {
    const events = [
      ...activity("start-a", "started"),
      ...activity("other-start-a", "started", { sessionId: "other" }),
      ...activity("other-finish-a", "completed", { sessionId: "other" }),
    ];

    expect(count(events, "session")).toBe(1);
    expect(count(events, "other")).toBe(0);
    expect(count(events, "missing")).toBe(0);
  });

  it("does not reopen a completed child when old starts are replayed", () => {
    const started = activity("start-a", "started");
    const completed = activity("finish-a", "completed");

    expect(count([...started, ...started])).toBe(1);
    expect(count([...started, ...completed, ...started, ...completed])).toBe(0);
  });

  it("allows a fresh task on a completed child and ignores old completion replay", () => {
    const oldStarted = activity("start-a", "started");
    const oldCompleted = activity("finish-a", "completed");
    const events = [
      ...oldStarted,
      ...oldCompleted,
      ...activity("restart-a", "started", { turnId: "turn_2" }),
    ];

    expect(count(events)).toBe(1);
    expect(count([...events, ...oldStarted, ...oldCompleted])).toBe(1);
    expect(
      count([
        ...events,
        ...activity("finish-restarted-a", "completed", {
          turnId: "turn_2",
        }),
      ]),
    ).toBe(0);
  });

  it("does not treat an interaction as evidence that a child is working", () => {
    expect(count(activity("message-a", "interacted"))).toBe(0);
    expect(
      count([
        ...activity("start-a", "started"),
        ...activity("finish-a", "completed"),
        ...activity("message-a", "interacted"),
      ]),
    ).toBe(0);
    expect(
      count([
        ...activity("start-a", "started"),
        ...activity("message-a", "interacted"),
      ]),
    ).toBe(1);
  });

  it("ignores the root agent and descendants below direct children", () => {
    const events = [
      ...activity("root", "started", {
        threadId: "root-thread",
        agentPath: "/root",
      }),
      ...activity("grandchild", "started", {
        threadId: "grandchild-thread",
        agentPath: "/root/worker/grandchild",
      }),
      ...activity("start-a", "started"),
    ];

    expect(count(events)).toBe(1);
  });

  it.each([null, "", "   ", 123, {}, []].map((threadId) => [threadId]))(
    "ignores invalid child identity %j",
    (threadId) => {
      expect(count(activity("invalid", "started", { threadId }))).toBe(0);
    },
  );

  it("ignores unrelated tools, incomplete lifecycle fields, and unknown activity kinds", () => {
    const rawInputs = [
      { command: "echo started", agentThreadId: "child-a" },
      { activityKind: "started" },
      { activityKind: "waiting", agentThreadId: "child-a" },
    ];
    const events = rawInputs.flatMap((rawInput, index) =>
      normalizeTunnelFrame({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "session",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: `unrelated-${index}`,
            title: "Tool",
            status: "in_progress",
            rawInput,
          },
        },
      }),
    );

    expect(count(events)).toBe(0);
    expect(count([])).toBe(0);
  });
});
