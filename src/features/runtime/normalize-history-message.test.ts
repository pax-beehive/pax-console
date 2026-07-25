import { describe, expect, it } from "vitest";
import { mergeEvents } from "./merge-session-events";
import {
  normalizeHistoryMessage,
  normalizeHistoryMessages,
} from "./normalize-history-message";

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

  it("concatenates adjacent history text chunks without adding a newline", () => {
    const events = normalizeHistoryMessages([
      historyTextChunk("msg_1", "`xxx"),
      historyTextChunk("msg_2", "bbb`"),
    ]);

    expect(events).toMatchObject([
      {
        type: "agent_message",
        id: "msg_1",
        sessionId: "sess_1",
        content: "`xxxbbb`",
        sessionUpdate: "agent_message_chunk",
        streaming: false,
      },
    ]);
  });

  it("does not virtually append closing backticks to completed history", () => {
    const events = normalizeHistoryMessages([
      historyTextChunk("msg_1", "bbb` "),
    ]);

    expect(events).toMatchObject([
      {
        type: "agent_message",
        content: "bbb` ",
        streaming: false,
      },
    ]);
  });

  it("keeps complete adjacent history messages as separate timeline events", () => {
    const events = normalizeHistoryMessages([
      historyTextChunk("msg_1", "first", "message"),
      historyTextChunk("msg_2", "second", "message"),
    ]);

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "agent_message",
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

  it("renders pax invocation messages at the parent position and hides replaced history", () => {
    const events = normalizeHistoryMessages([
      {
        message_id: "msg_tool_call",
        session_id: "sess_1",
        role: "assistant",
        message_type: "tool_call",
        created_at: "2026-07-04T10:00:00.000Z",
        parts: [
          {
            message_id: "msg_tool_call",
            part_index: 0,
            part_type: "text",
            text: "raw tool call",
          },
        ],
      },
      {
        message_id: "msg_tool_done",
        session_id: "sess_1",
        role: "assistant",
        message_type: "tool_call_update",
        created_at: "2026-07-04T10:00:01.000Z",
        parts: [
          {
            message_id: "msg_tool_done",
            part_index: 0,
            part_type: "text",
            text: "raw tool result",
          },
        ],
      },
      {
        message_id: "msg_invocation",
        session_id: "sess_1",
        message_type: "pax:invocation",
        parent_message_id: "msg_tool_done",
        created_at: "2026-07-04T10:00:02.000Z",
        raw_json: {
          invocation_id: "inv_123",
          phase: "inquiry",
          side: "source",
          replaces_message_ids: ["msg_tool_call", "msg_tool_done"],
          sender: {
            agent_id: "agent_a",
            agent_name: "Contract Writer",
            representative_agent_id: "rep_source",
            session_id: "sess_a",
            user_name: "Ada",
          },
          receiver: {
            agent_id: "agent_b",
            agent_name: "Review Agent",
            representative_agent_id: "rep_target",
            session_id: "sess_b",
            user_name: "Grace",
          },
          content: {
            display_text: "Asked Agent B to review the request contract.",
            original_text: "Please review the request contract.",
          },
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "invocation",
      id: "msg_invocation",
      sessionId: "sess_1",
      content: "Asked Agent B to review the request contract.",
      originalContent: "Please review the request contract.",
      invocationId: "inv_123",
      phase: "inquiry",
      side: "source",
      parentMessageId: "msg_tool_done",
      replacesMessageIds: ["msg_tool_call", "msg_tool_done"],
      sender: {
        agentId: "agent_a",
        agentName: "Contract Writer",
        representativeAgentId: "rep_source",
        sessionId: "sess_a",
        userName: "Ada",
      },
      receiver: {
        agentId: "agent_b",
        agentName: "Review Agent",
        representativeAgentId: "rep_target",
        sessionId: "sess_b",
        userName: "Grace",
      },
    });
  });

  it("hides the invocation parent when replaces_message_ids is absent", () => {
    const events = normalizeHistoryMessages([
      {
        message_id: "msg_real_prompt",
        session_id: "sess_1",
        role: "user",
        created_at: "2026-07-04T10:00:00.000Z",
        parts: [
          {
            message_id: "msg_real_prompt",
            part_index: 0,
            part_type: "text",
            text: "wrapped raw prompt",
          },
        ],
      },
      {
        message_id: "msg_invocation",
        session_id: "sess_1",
        message_type: "pax:invocation",
        parent_message_id: "msg_real_prompt",
        created_at: "2026-07-04T10:00:01.000Z",
        raw_json: {
          content: {
            display_text: "Agent A asked you to review the request contract.",
          },
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "invocation",
      content: "Agent A asked you to review the request contract.",
      parentMessageId: "msg_real_prompt",
      replacesMessageIds: [],
    });
  });

  it("renders pax invocation pending messages until a final replacement arrives", () => {
    const events = normalizeHistoryMessages([
      {
        message_id: "msg_tool_done",
        session_id: "sess_1",
        role: "assistant",
        message_type: "tool_call_update",
        created_at: "2026-07-04T10:00:00.000Z",
        parts: [
          {
            message_id: "msg_tool_done",
            part_index: 0,
            part_type: "text",
            text: "raw tool result",
          },
        ],
      },
      {
        message_id: "msg_invocation_pending",
        session_id: "sess_1",
        message_type: "pax:invocation_pending",
        parent_message_id: "msg_tool_done",
        created_at: "2026-07-04T10:00:01.000Z",
        raw_json: {
          phase: "inquiry",
          side: "source",
          receiver: {
            agent_id: "agent_b",
            agent_name: "Review Agent",
            representative_agent_id: "rep_target",
          },
          content: {
            display_text: "Asked Review Agent for input.",
            original_text: "Please review the request contract.",
          },
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "invocation",
      id: "msg_invocation_pending",
      state: "pending",
      side: "source",
      parentMessageId: "msg_tool_done",
      content: "Asked Review Agent for input.",
      originalContent: "Please review the request contract.",
      receiver: {
        agentId: "agent_b",
        agentName: "Review Agent",
        representativeAgentId: "rep_target",
      },
    });
  });

  it("replaces pax invocation pending messages with final invocation messages in history", () => {
    const events = normalizeHistoryMessages([
      {
        message_id: "msg_invocation_pending",
        session_id: "sess_1",
        message_type: "pax:invocation_pending",
        created_at: "2026-07-04T10:00:01.000Z",
        raw_json: {
          phase: "inquiry",
          side: "source",
          receiver: { agent_name: "Review Agent" },
          content: {
            display_text: "Asked Review Agent for input.",
            original_text: "How is the weather?",
          },
        },
      },
      {
        message_id: "msg_invocation_final",
        session_id: "sess_1",
        message_type: "pax:invocation",
        created_at: "2026-07-04T10:00:03.000Z",
        raw_json: {
          phase: "reply",
          side: "source",
          replaces_message_ids: ["msg_invocation_pending"],
          receiver: { agent_name: "Review Agent" },
          content: {
            display_text: "It is rainy in New York.",
            original_text: "How is the weather?",
          },
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "invocation",
      id: "msg_invocation_final",
      state: "complete",
      content: "It is rainy in New York.",
      replacesMessageIds: ["msg_invocation_pending"],
    });
  });

  it("infers the remote agent id from target-side invocation display text", () => {
    const events = normalizeHistoryMessages([
      {
        message_id: "msg_invocation",
        session_id: "sess_1",
        message_type: "pax:invocation",
        parent_message_id: "msg_real_reply",
        created_at: "2026-07-04T10:00:01.000Z",
        raw_json: {
          phase: "reply",
          side: "target",
          content: {
            display_text:
              "Received a Pax conversation reply from agent_2f0851ab56e19ab5a04c5ac695cddcccaca294a75898d1a0.",
          },
        },
      },
    ]);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "invocation",
      side: "target",
      sender: {
        agentId: "agent_2f0851ab56e19ab5a04c5ac695cddcccaca294a75898d1a0",
      },
      receiver: undefined,
    });
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
        grant_body: {
          approval_mode: "auto_approve_all",
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
        source: "auto",
        status: "approved",
      },
    });
  });

  it("normalizes stored Gemini edit permission blocks into write patches", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_gemini_permission",
      session_id: "sess_history",
      message_type: "session/request_permission",
      role: "assistant",
      created_at: "2026-07-09T17:08:36.230026-07:00",
      raw_json: {
        id: 2,
        method: "session/request_permission",
        params: {
          approvalId: "appr_gemini",
          approval_id: "appr_gemini",
          options: [{ name: "Allow", optionId: "proceed_once" }],
          sessionId: "sess_history",
          toolCall: {
            content: [
              {
                _meta: { kind: "add" },
                newText: "#!/usr/bin/env python3\nprint('weather')\n",
                oldText: "",
                path: "/private/tmp/weather.py",
                type: "diff",
              },
            ],
            kind: "edit",
            locations: [{ path: "/private/tmp/weather.py" }],
            status: "pending",
            title: "Writing to ../private/tmp/weather.py",
            toolCallId: "write_file__ujao7t88",
          },
        },
        jsonrpc: "2.0",
      },
    });

    expect(events).toMatchObject([
      {
        type: "permission_request",
        approvalId: "appr_gemini",
        patches: [
          {
            operation: "write",
            path: "/private/tmp/weather.py",
            newText: "#!/usr/bin/env python3\nprint('weather')\n",
            source: "permission",
          },
        ],
        requestId: "2",
        sessionId: "sess_history",
        title: "Writing to ../private/tmp/weather.py",
        toolCallId: "write_file__ujao7t88",
        toolKind: "edit",
      },
    ]);
  });

  it("normalizes stored Gemini tool updates into output write patches", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_gemini_tool_update",
      session_id: "sess_history",
      message_type: "tool_call_update",
      role: "assistant",
      created_at: "2026-07-09T17:08:39.926239-07:00",
      raw_json: {
        method: "session/update",
        params: {
          sessionId: "sess_history",
          update: {
            content: [
              {
                _meta: { kind: "add" },
                newText: "#!/usr/bin/env python3\nprint('weather')\n",
                oldText: "",
                path: "/private/tmp/weather.py",
                type: "diff",
              },
            ],
            kind: "edit",
            locations: [{ path: "/private/tmp/weather.py" }],
            sessionUpdate: "tool_call_update",
            status: "completed",
            title: "Writing to ../private/tmp/weather.py",
            toolCallId: "write_file__ujao7t88",
          },
        },
        jsonrpc: "2.0",
      },
    });

    expect(events).toMatchObject([
      {
        type: "tool_call",
        id: "sess_history:tool:write_file__ujao7t88",
        name: "Writing to ../private/tmp/weather.py",
        patches: [
          {
            operation: "write",
            path: "/private/tmp/weather.py",
            newText: "#!/usr/bin/env python3\nprint('weather')\n",
            source: "output",
          },
        ],
        sessionUpdate: "tool_call_update",
        status: "done",
        toolCallId: "write_file__ujao7t88",
      },
    ]);
  });

  it("restores aggregated terminal output from message parts", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_terminal_output",
      session_id: "sess_history",
      message_type: "tool_call_update",
      role: "assistant",
      created_at: "2026-07-24T12:00:00.000Z",
      raw_json: {
        method: "session/update",
        params: {
          sessionId: "sess_history",
          update: {
            _meta: {
              terminal_output_delta: {
                data: " M first.go\n",
                terminal_id: "call_1",
              },
            },
            sessionUpdate: "tool_call_update",
            toolCallId: "call_1",
          },
        },
        jsonrpc: "2.0",
      },
      parts: [
        {
          message_id: "msg_terminal_output",
          part_index: 0,
          part_type: "text",
          text: " M first.go\n M second.go\n",
        },
      ],
    });

    expect(events).toMatchObject([
      {
        type: "tool_call",
        id: "sess_history:tool:call_1",
        toolCallId: "call_1",
        output: " M first.go\n M second.go\n",
        outputMode: "replace",
      },
    ]);
  });

  it("marks stored user-approved permission responses as user decisions", () => {
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
            title: "go test ./...",
            toolCallId: "perm-check-1",
          },
          options: [
            {
              kind: "allow_once",
              name: "Allow once",
              optionId: "allow_once",
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
        decided_by_user_id: "usr_manual",
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
      decision: {
        decisionOption: "allow_once",
        source: "user",
        status: "approved",
      },
    });
  });
});

function historyTextChunk(
  messageId: string,
  text: string,
  messageType = "agent_message_chunk",
) {
  return {
    message_id: messageId,
    session_id: "sess_1",
    role: "assistant",
    message_type: messageType,
    created_at: "2026-07-21T12:00:00.000Z",
    parts: [
      {
        message_id: messageId,
        part_index: 0,
        part_type: "text",
        text,
      },
    ],
  };
}
