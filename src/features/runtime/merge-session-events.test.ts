import { describe, expect, it } from "vitest";
import { mergeEvents } from "./merge-session-events";
import { SessionEvent } from "./session-events";

describe("mergeEvents", () => {
  it("replaces an already-rendered parent event with a pax invocation event", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "msg_tool_done",
        sessionId: "sess_1",
        content: "raw tool result",
        createdAt: "2026-07-04T10:00:00.000Z",
      },
      {
        type: "invocation",
        id: "msg_invocation",
        sessionId: "sess_1",
        content: "Asked Agent B to review the request contract.",
        parentMessageId: "msg_tool_done",
        replacesMessageIds: ["msg_tool_done"],
        createdAt: "2026-07-04T10:00:01.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "invocation",
      id: "msg_invocation",
      content: "Asked Agent B to review the request contract.",
    });
  });

  it("replaces a pending pax invocation event with the final invocation event", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "msg_tool_done",
        sessionId: "sess_1",
        content: "raw tool result",
        createdAt: "2026-07-04T10:00:00.000Z",
      },
      {
        type: "invocation",
        id: "msg_invocation_pending",
        sessionId: "sess_1",
        content: "Asked Review Agent for input.",
        parentMessageId: "msg_tool_done",
        state: "pending",
        side: "source",
        replacesMessageIds: [],
        createdAt: "2026-07-04T10:00:01.000Z",
      },
      {
        type: "invocation",
        id: "msg_invocation_final",
        sessionId: "sess_1",
        content: "It is rainy in New York.",
        state: "complete",
        side: "source",
        replacesMessageIds: ["msg_invocation_pending"],
        createdAt: "2026-07-04T10:00:02.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "invocation",
      id: "msg_invocation_final",
      content: "It is rainy in New York.",
      replacesMessageIds: ["msg_invocation_pending"],
    });
  });

  it("skips real events that arrive after their pax invocation replacement", () => {
    const events: SessionEvent[] = [
      {
        type: "invocation",
        id: "msg_invocation",
        sessionId: "sess_1",
        content: "Agent A asked you to review the request contract.",
        parentMessageId: "msg_real_prompt",
        replacesMessageIds: [],
        createdAt: "2026-07-04T10:00:00.000Z",
      },
      {
        type: "user_message",
        id: "msg_real_prompt",
        sessionId: "sess_1",
        content: "wrapped raw prompt",
        createdAt: "2026-07-04T10:00:01.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "invocation",
      id: "msg_invocation",
    });
  });

  it("keeps tool calls between assistant message streaming segments", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "我先跑一下：",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-06-29T18:00:00.000Z",
      },
      {
        type: "tool_call",
        id: "sess_1:tool:tc_1",
        sessionId: "sess_1",
        name: "terminal: pnpm test",
        status: "running",
        toolCallId: "tc_1",
        createdAt: "2026-06-29T18:00:01.000Z",
      },
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "跑完了，继续解释。",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-06-29T18:00:02.000Z",
      },
      {
        type: "tool_call",
        id: "sess_1:tool:tc_1",
        sessionId: "sess_1",
        name: "tc_1",
        status: "done",
        toolCallId: "tc_1",
        output: [{ content: { text: "ok", type: "text" }, type: "content" }],
        createdAt: "2026-06-29T18:00:03.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toMatchObject([
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        content: "我先跑一下：",
      },
      {
        type: "tool_call",
        id: "sess_1:tool:tc_1",
        name: "terminal: pnpm test",
        status: "done",
        output: [{ content: { text: "ok", type: "text" }, type: "content" }],
      },
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1:segment:1",
        content: "跑完了，继续解释。",
      },
    ]);
  });

  it("keeps tool calls between thought streaming segments", () => {
    const events: SessionEvent[] = [
      {
        type: "progress",
        id: "sess_1:agent_thought_chunk:turn_1",
        sessionId: "sess_1",
        content: "先分析一下。",
        streaming: true,
        sessionUpdate: "agent_thought_chunk",
        createdAt: "2026-06-29T18:00:00.000Z",
      },
      {
        type: "tool_call",
        id: "sess_1:tool:tc_1",
        sessionId: "sess_1",
        name: "terminal: pnpm test",
        status: "running",
        toolCallId: "tc_1",
        createdAt: "2026-06-29T18:00:01.000Z",
      },
      {
        type: "progress",
        id: "sess_1:agent_thought_chunk:turn_1",
        sessionId: "sess_1",
        content: "工具回来后继续想。",
        streaming: true,
        sessionUpdate: "agent_thought_chunk",
        createdAt: "2026-06-29T18:00:02.000Z",
      },
      {
        type: "tool_call",
        id: "sess_1:tool:tc_1",
        sessionId: "sess_1",
        name: "terminal: pnpm test",
        status: "done",
        toolCallId: "tc_1",
        output: [{ content: { text: "ok", type: "text" }, type: "content" }],
        createdAt: "2026-06-29T18:00:03.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toMatchObject([
      {
        type: "progress",
        id: "sess_1:agent_thought_chunk:turn_1",
        content: "先分析一下。",
      },
      {
        type: "tool_call",
        id: "sess_1:tool:tc_1",
        status: "done",
      },
      {
        type: "progress",
        id: "sess_1:agent_thought_chunk:turn_1:segment:1",
        content: "工具回来后继续想。",
      },
    ]);
  });

  it("does not split thought chunks around hidden runtime events", () => {
    const events: SessionEvent[] = [
      {
        type: "progress",
        id: "sess_1:agent_thought_chunk:turn_1",
        sessionId: "sess_1",
        content: "先想一下。",
        streaming: true,
        sessionUpdate: "agent_thought_chunk",
        createdAt: "2026-06-29T18:00:00.000Z",
      },
      {
        type: "token_usage",
        id: "sess_1:usage:thought",
        sessionId: "sess_1",
        totalTokens: 256,
        createdAt: "2026-06-29T18:00:01.000Z",
      },
      {
        type: "progress",
        id: "sess_1:agent_thought_chunk:turn_1",
        sessionId: "sess_1",
        content: "继续想。",
        streaming: true,
        sessionUpdate: "agent_thought_chunk",
        createdAt: "2026-06-29T18:00:02.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toMatchObject([
      {
        type: "progress",
        id: "sess_1:agent_thought_chunk:turn_1",
        content: "先想一下。继续想。",
      },
      {
        type: "token_usage",
        totalTokens: 256,
      },
    ]);
  });

  it("attaches permission requests wrapped by a tool call to that tool event", () => {
    const events: SessionEvent[] = [
      {
        type: "tool_call",
        id: "sess_1:tool:tc_1",
        sessionId: "sess_1",
        name: "terminal: rm /Tmp/tttt/secret.txt",
        status: "running",
        sessionUpdate: "tool_call",
        toolCallId: "tc_1",
        createdAt: "2026-06-29T20:37:09.480Z",
      },
      {
        type: "permission_request",
        id: "perm_0",
        sessionId: "sess_1",
        requestId: "0",
        title: "delete in root path: rm /Tmp/tttt/secret.txt",
        toolCallId: "perm-check-1",
        toolKind: "execute",
        options: [],
        createdAt: "2026-06-29T20:37:09.588Z",
      },
      {
        type: "permission_decision",
        id: "perm_0:decision",
        sessionId: "sess_1",
        requestId: "0",
        decision: {
          decisionOption: "allow_once",
          status: "approved",
        },
        createdAt: "2026-06-29T20:37:12.416Z",
      },
      {
        type: "tool_call",
        id: "sess_1:tool:tc_1",
        sessionId: "sess_1",
        name: "tc_1",
        status: "done",
        sessionUpdate: "tool_call_update",
        toolCallId: "tc_1",
        output: [
          {
            content: {
              text: "terminal result\n- **approval:** approved",
              type: "text",
            },
            type: "content",
          },
        ],
        createdAt: "2026-06-29T20:37:12.476Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "tool_call",
      id: "sess_1:tool:tc_1",
      name: "terminal: rm /Tmp/tttt/secret.txt",
      status: "done",
      permissions: [
        {
          type: "permission_request",
          requestId: "0",
          title: "delete in root path: rm /Tmp/tttt/secret.txt",
          decision: {
            decisionOption: "allow_once",
            status: "approved",
          },
        },
      ],
    });
  });

  it("marks open tool calls done when the run finishes without a tool update", () => {
    const events: SessionEvent[] = [
      {
        type: "tool_call",
        id: "sess_1:tool:tc_read",
        sessionId: "sess_1",
        name: "read: /tmp/tttt/secret.txt",
        status: "running",
        sessionUpdate: "tool_call",
        toolCallId: "tc_read",
        createdAt: "2026-06-29T18:00:00.000Z",
      },
      {
        type: "run_status",
        id: "sess_1:done",
        sessionId: "sess_1",
        status: "done",
        createdAt: "2026-06-29T18:00:01.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toMatchObject([
      {
        type: "tool_call",
        id: "sess_1:tool:tc_read",
        status: "done",
      },
      {
        type: "run_status",
        status: "done",
      },
    ]);
  });

  it("marks open tool calls failed when the run errors before a tool update", () => {
    const events: SessionEvent[] = [
      {
        type: "tool_call",
        id: "sess_1:tool:tc_read",
        sessionId: "sess_1",
        name: "read: /tmp/tttt/secret.txt",
        status: "running",
        sessionUpdate: "tool_call",
        toolCallId: "tc_read",
        createdAt: "2026-06-29T18:00:00.000Z",
      },
      {
        type: "run_status",
        id: "sess_1:error",
        sessionId: "sess_1",
        status: "error",
        createdAt: "2026-06-29T18:00:01.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged[0]).toMatchObject({
      type: "tool_call",
      id: "sess_1:tool:tc_read",
      status: "error",
    });
  });

  it("does not split message chunks around hidden runtime events", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "第一段",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-06-29T18:00:00.000Z",
      },
      {
        type: "token_usage",
        id: "sess_1:usage:1",
        sessionId: "sess_1",
        totalTokens: 128,
        createdAt: "2026-06-29T18:00:01.000Z",
      },
      {
        type: "run_status",
        id: "sess_1:status:1",
        sessionId: "sess_1",
        status: "running",
        createdAt: "2026-06-29T18:00:02.000Z",
      },
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "第二段",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-06-29T18:00:03.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged).toMatchObject([
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        content: "第一段第二段",
      },
      {
        type: "token_usage",
        totalTokens: 128,
      },
      {
        type: "run_status",
        status: "running",
      },
    ]);
  });

  it("preserves input order instead of sorting by timestamps", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "message-later-time",
        sessionId: "sess_1",
        content: "first from history",
        createdAt: "2026-06-29T18:00:02.000Z",
      },
      {
        type: "tool_call",
        id: "tool-earlier-time",
        sessionId: "sess_1",
        name: "terminal: echo ok",
        status: "done",
        createdAt: "2026-06-29T18:00:01.000Z",
      },
    ];

    const merged = mergeEvents(events);

    expect(merged.map((event) => event.id)).toEqual([
      "message-later-time",
      "tool-earlier-time",
    ]);
  });
});
