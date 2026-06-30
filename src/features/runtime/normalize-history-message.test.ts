import { describe, expect, it } from "vitest";
import { mergeEvents } from "./merge-session-events";
import { normalizeHistoryMessage } from "./normalize-history-message";

describe("normalizeHistoryMessage", () => {
  it("restores aggregated text from ordered message parts", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_1",
      session_id: "sess_1",
      role: "assistant",
      created_at: "2026-06-19T16:00:00.000Z",
      parts: [
        {
          message_id: "msg_1",
          part_index: 1,
          part_type: "text",
          text: "好",
        },
        {
          message_id: "msg_1",
          part_index: 0,
          part_type: "text",
          text: "你",
        },
      ],
    });

    expect(events).toMatchObject([
      {
        type: "agent_message",
        id: "msg_1",
        sessionId: "sess_1",
        content: "你好",
      },
    ]);
  });

  it("restores thought parts as progress events", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_2",
      session_id: "sess_1",
      role: "assistant",
      created_at: "2026-06-19T16:00:00.000Z",
      parts: [
        {
          message_id: "msg_2",
          part_index: 0,
          part_type: "agent_thought",
          text: "Need to inspect the repo.",
        },
      ],
    });

    expect(events).toMatchObject([
      {
        type: "progress",
        id: "msg_2:thought",
        sessionId: "sess_1",
        content: "Need to inspect the repo.",
      },
    ]);
  });

  it("uses message_type to restore text parts as progress events", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_3",
      session_id: "sess_1",
      message_type: "thought",
      role: "assistant",
      created_at: "2026-06-19T16:00:00.000Z",
      parts: [
        {
          message_id: "msg_3",
          part_index: 0,
          part_type: "text",
          text: "Thinking from stored history.",
        },
      ],
    });

    expect(events).toMatchObject([
      {
        type: "progress",
        id: "msg_3:thought",
        sessionId: "sess_1",
        content: "Thinking from stored history.",
      },
    ]);
  });

  it("restores stored ACP tool calls from history frames", () => {
    const started = normalizeHistoryMessage({
      message_id: "msg_tool_start",
      session_id: "sess_history",
      role: "assistant",
      created_at: "2026-06-29T18:00:00.000Z",
      raw_json: {
        type: "acp",
        session_id: "sess_history",
        frame: {
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "sess_history",
            update: {
              content: [
                {
                  content: { text: "sleep 5", type: "text" },
                  type: "content",
                },
              ],
              sessionUpdate: "tool_call",
              title: "terminal: sleep 5",
              toolCallId: "tc-history",
            },
          },
        },
      },
    });
    const completed = normalizeHistoryMessage({
      message_id: "msg_tool_done",
      session_id: "sess_history",
      role: "assistant",
      created_at: "2026-06-29T18:00:05.000Z",
      parts: [
        {
          message_id: "msg_tool_done",
          part_index: 0,
          part_type: "acp",
          payload_json: {
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: "sess_history",
              update: {
                content: [
                  {
                    content: { text: "terminal result", type: "text" },
                    type: "content",
                  },
                ],
                sessionUpdate: "tool_call_update",
                status: "completed",
                toolCallId: "tc-history",
              },
            },
          },
        },
      ],
    });

    const merged = mergeEvents([...started, ...completed]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "tool_call",
      id: "sess_history:tool:tc-history",
      sessionId: "sess_history",
      name: "terminal: sleep 5",
      status: "done",
      toolCallId: "tc-history",
      output: [
        {
          content: { text: "terminal result", type: "text" },
          type: "content",
        },
      ],
    });
  });

  it("folds stored permission responses back into permission request events", () => {
    const requested = normalizeHistoryMessage({
      message_id: "msg_permission_request",
      session_id: "sess_history",
      message_type: "session/request_permission",
      role: "assistant",
      created_at: "2026-06-29T20:37:09.000Z",
      raw_json: {
        id: 0,
        method: "session/request_permission",
        params: {
          sessionId: "native_session",
          toolCall: {
            kind: "execute",
            title: "delete in root path: rm /Tmp/tttt/secret.txt",
            rawInput: {
              command: "rm /Tmp/tttt/secret.txt",
              description: "delete in root path",
            },
            toolCallId: "perm-check-1",
          },
          options: [
            {
              kind: "allow_once",
              name: "Allow once",
              optionId: "allow_once",
            },
            {
              kind: "reject_once",
              name: "Deny",
              optionId: "deny",
            },
          ],
        },
        jsonrpc: "2.0",
      },
    });
    const responded = normalizeHistoryMessage({
      message_id: "msg_permission_response",
      session_id: "sess_history",
      message_type: "permission_response",
      role: "user",
      created_at: "2026-06-29T20:37:12.000Z",
      raw_json: {
        id: 0,
        result: {
          outcome: {
            outcome: "selected",
            optionId: "allow_once",
          },
        },
        jsonrpc: "2.0",
      },
    });

    const merged = mergeEvents([...requested, ...responded]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "permission_request",
      sessionId: "sess_history",
      requestId: "0",
      title: "delete in root path: rm /Tmp/tttt/secret.txt",
      decision: {
        decisionOption: "allow_once",
        status: "approved",
      },
    });
  });
});
