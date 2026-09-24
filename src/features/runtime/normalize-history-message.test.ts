import { describe, expect, it } from "vitest";
import { mergeEvents } from "./merge-session-events";
import {
  normalizeHistoryMessage,
  normalizeHistoryMessages,
} from "./normalize-history-message";

describe("normalizeHistoryMessage", () => {
  it("restores prompt text when a summary contains only the raw prompt frame", () => {
    const message = {
      message_id: "prompt",
      session_id: "sess_1",
      turn_id: "turn_1",
      role: "user",
      raw_json: {
        method: "session/prompt",
        params: {
          prompt: [
            { type: "text", text: "Read deployment status" },
            { type: "text", text: "Keep it read-only" },
          ],
        },
      },
      parts: [],
    };
    expect(normalizeHistoryMessage(message)).toMatchObject([
      {
        type: "user_message",
        content: "Read deployment status\nKeep it read-only",
        turnId: "turn_1",
      },
    ]);
    expect(
      normalizeHistoryMessage({
        ...message,
        parts: [{ part_index: 0, part_type: "text", text: "Canonical prompt" }],
      }),
    ).toMatchObject([{ type: "user_message", content: "Canonical prompt" }]);
  });
  it.each([
    [
      `file:///home/pax/.paxd/attachments/remotes/remote/att_${"a".repeat(48)}/Screenshot%20one.png`,
      `att_${"a".repeat(48)}`,
    ],
    [
      `file:///home/pax/.paxd/attachments/local/att_${"b".repeat(48)}/photo.png`,
      `att_${"b".repeat(48)}`,
    ],
    [`https://example.com/att_${"a".repeat(48)}/photo.png`, undefined],
    ["file:///tmp/other/photo.png", undefined],
    ["not a URL", undefined],
  ])("restores only a localized attachment ID from %s", (uri, attachmentId) => {
    const events = normalizeHistoryMessage({
      role: "user",
      message_id: "msg_image",
      session_id: "sess_1",
      raw_json: {
        method: "session/prompt",
        params: {
          prompt: [
            {
              type: "resource_link",
              uri,
              name: "photo.png",
              mimeType: "image/png",
            },
          ],
        },
      },
    });
    expect(events).toMatchObject([
      {
        type: "user_message",
        attachments: [{ attachmentId, filename: "photo.png" }],
      },
    ]);
    expect(events[0]).not.toHaveProperty("attachments.0.uri");
  });
  it("reads attachment-only history from a wrapped prompt part and ignores malformed resources", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_files",
      role: "user",
      session_id: "sess_1",
      parts: [
        {
          part_index: 0,
          part_type: "text",
          text: "",
          payload_json: {
            type: "acp",
            frame: {
              method: "session/prompt",
              params: {
                prompt: [
                  {
                    type: "resource_link",
                    uri: "file:///tmp/report.pdf",
                    name: "report.pdf",
                  },
                  { type: "resource_link", name: "missing-uri" },
                  { type: "resource_link", uri: "file:///tmp/missing-name" },
                  null,
                ],
              },
            },
          },
        },
      ],
    });
    expect(events).toMatchObject([
      {
        type: "user_message",
        content: "",
        attachments: [{ filename: "report.pdf" }],
      },
    ]);
  });
  it("restores sent attachment names from the durable prompt without duplicating them", () => {
    const prompt = {
      method: "session/prompt",
      params: {
        prompt: [
          { type: "text", text: "See screenshot" },
          {
            type: "resource_link",
            uri: "file:///tmp/att_1/Screenshot.png",
            name: "Screenshot.png",
            mimeType: "image/png",
          },
          {
            type: "resource_link",
            uri: "file:///tmp/att_2/notes.pdf",
            name: "notes.pdf",
            mimeType: "application/pdf",
          },
        ],
      },
    };
    const events = normalizeHistoryMessage({
      message_id: "msg_1",
      role: "user",
      session_id: "sess_1",
      turn_id: "turn_1",
      raw_json: prompt,
      parts: [
        {
          part_index: 0,
          part_type: "text",
          text: "See screenshot",
          payload_json: prompt,
        },
      ],
    });
    expect(events).toMatchObject([
      {
        type: "user_message",
        content: "See screenshot",
        turnId: "turn_1",
        attachments: [
          { filename: "Screenshot.png", contentType: "image/png" },
          { filename: "notes.pdf", contentType: "application/pdf" },
        ],
      },
    ]);
    expect(events).toHaveLength(1);
  });
  it("preserves the durable business turn id", () => {
    expect(
      normalizeHistoryMessage({
        message_id: "msg_1",
        session_id: "sess_1",
        turn_id: "turn_1",
        role: "assistant",
        parts: [{ part_index: 0, part_type: "text", text: "Hello" }],
      }),
    ).toMatchObject([{ type: "agent_message", turnId: "turn_1" }]);
  });

  it("normalizes the durable turn completion marker", () => {
    expect(
      normalizeHistoryMessages([
        {
          message_id: "msg_turn_1_done",
          message_type: "turn_done",
          session_id: "sess_1",
          status: "complete",
          turn_id: "turn_1",
          raw_json: { turn_status: "complete" },
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        type: "turn_done",
        id: "msg_turn_1_done",
        sessionId: "sess_1",
        turnId: "turn_1",
      }),
    ]);
  });

  it("restores context and final turn usage from durable ACP frames", () => {
    const events = normalizeHistoryMessages([
      {
        message_id: "msg_context",
        message_type: "usage_update",
        session_id: "sess_1",
        turn_id: "turn_1",
        raw_json: {
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "sess_1",
            update: {
              sessionUpdate: "usage_update",
              size: 258_400,
              used: 16_372,
            },
          },
        },
      },
      {
        message_id: "msg_end_turn",
        message_type: "end_turn",
        session_id: "sess_1",
        turn_id: "turn_1",
        raw_json: {
          id: 7,
          jsonrpc: "2.0",
          result: {
            stopReason: "end_turn",
            usage: {
              cachedReadTokens: 11_264,
              inputTokens: 5_056,
              outputTokens: 52,
              totalTokens: 16_372,
            },
          },
        },
      },
    ]);

    expect(events).toMatchObject([
      {
        type: "context_usage",
        turnId: "turn_1",
        usedTokens: 16_372,
        windowTokens: 258_400,
      },
      {
        type: "token_usage",
        turnId: "turn_1",
        cacheReadTokens: 11_264,
        totalTokens: 16_372,
      },
      { type: "turn_done", turnId: "turn_1" },
    ]);
  });

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

  it("coalesces consecutive durable segments without adding display breaks", () => {
    const segment = (id: string, content: string, sessionSeq: number) => ({
      ...historyTextChunk(id, content),
      raw_json: { text_layout: "segment" },
      session_seq: sessionSeq,
      turn_id: "turn_1",
    });

    const events = normalizeHistoryMessages([
      segment("msg_14", "1. **这是", 14),
      segment("msg_15", "先做给自己家用？**\n2. **", 15),
      segment("msg_16", "远程访问能接受 Tailscale 这类", 16),
      segment("msg_17", "客户端吗？**\n", 17),
    ]);

    expect(events).toMatchObject([
      {
        type: "agent_message",
        id: "msg_14",
        content:
          "1. **这是先做给自己家用？**\n2. **远程访问能接受 Tailscale 这类客户端吗？**\n",
        historyTextLayout: "segment",
        streaming: false,
      },
    ]);
  });

  it("keeps durable segments separate across a sequence gap", () => {
    const segment = (id: string, content: string, sessionSeq: number) => ({
      ...historyTextChunk(id, content),
      raw_json: { text_layout: "segment" },
      session_seq: sessionSeq,
      turn_id: "turn_1",
    });

    const events = normalizeHistoryMessages([
      segment("msg_14", "Before tool", 14),
      segment("msg_16", "After tool", 16),
    ]);

    expect(
      events
        .filter((event) => event.type === "agent_message")
        .map((event) => event.content),
    ).toEqual(["Before tool", "After tool"]);
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

  it("places an aggregated final answer after its turn tool calls", () => {
    const turnId = "turn_1";
    const events = mergeEvents(
      normalizeHistoryMessages([
        {
          message_id: "msg_user",
          session_id: "sess_1",
          turn_id: turnId,
          role: "user",
          created_at: "2026-08-04T21:06:35.000Z",
          parts: [
            {
              message_id: "msg_user",
              part_index: 0,
              part_type: "text",
              text: "Please fix the ordering",
            },
          ],
        },
        {
          ...historyTextChunk(
            "msg_thought",
            "Inspecting the timeline",
            "agent_thought_chunk",
          ),
          turn_id: turnId,
        },
        {
          ...historyTextChunk("msg_answer", "Starting now. Fixed."),
          turn_id: turnId,
        },
        historyToolCall("msg_tool_start", turnId, "tool_call", "in_progress"),
        historyToolCall(
          "msg_tool_done",
          turnId,
          "tool_call_update",
          "completed",
        ),
        {
          message_id: "msg_turn_done",
          message_type: "turn_done",
          session_id: "sess_1",
          turn_id: turnId,
          created_at: "2026-08-04T21:17:23.000Z",
        },
      ]),
    );

    expect(events.map((event) => event.type)).toEqual([
      "user_message",
      "progress",
      "tool_call",
      "agent_message",
      "turn_done",
    ]);
  });

  it("preserves segmented text around tools when restoring a completed turn", () => {
    const segment = (id: string, content: string) => ({
      ...historyTextChunk(id, content),
      turn_id: "turn_1",
      raw_json: { text_layout: "segment" },
    });
    const a = segment("a", "Starting");
    const b = segment("b", "Finished");
    const events = mergeEvents(
      normalizeHistoryMessages([
        a,
        historyToolCall("tool", "turn_1", "tool_call", "completed"),
        b,
        {
          message_id: "done",
          message_type: "turn_done",
          turn_id: "turn_1",
          session_id: "sess_1",
        },
      ]),
    );
    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "tool_call",
      "agent_message",
      "turn_done",
    ]);
    expect(
      events
        .filter((event) => event.type === "agent_message")
        .map((event) => event.content),
    ).toEqual(["Starting", "Finished"]);
    // A summary page can omit the intervening tool. Distinct durable text rows
    // must still not be concatenated merely because they are now adjacent.
    expect(normalizeHistoryMessages([a, b]).map((event) => event.id)).toEqual([
      "a",
      "b",
    ]);
    // During a rolling update the opening row may predate the segment marker.
    const mixed = normalizeHistoryMessages([
      { ...a, raw_json: undefined },
      historyToolCall("tool", "turn_1", "tool_call", "completed"),
      b,
      {
        message_id: "done",
        message_type: "turn_done",
        turn_id: "turn_1",
        session_id: "sess_1",
      },
    ]);
    expect(mixed.map((event) => event.type)).toEqual([
      "agent_message",
      "tool_call",
      "agent_message",
      "turn_done",
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

  it("restores artifact publication cards from pax artifact history messages", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_artifact",
      session_id: "sess_1",
      message_type: "pax:artifact",
      created_at: "2026-07-26T12:00:00.000Z",
      parts: [
        {
          message_id: "msg_artifact",
          part_index: 0,
          part_type: "artifact",
          artifact_uri: "artifact-publication://apub_123/main",
          payload_json: {
            publication_id: "apub_123",
          },
        },
      ],
    });

    expect(events).toMatchObject([
      {
        type: "artifact_publication",
        id: "msg_artifact:artifact:0:apub_123",
        sessionId: "sess_1",
        publicationId: "apub_123",
        contentRef: "main",
        artifactUri: "artifact-publication://apub_123/main",
      },
    ]);
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

function historyToolCall(
  messageId: string,
  turnId: string,
  sessionUpdate: "tool_call" | "tool_call_update",
  status: "in_progress" | "completed",
) {
  return {
    message_id: messageId,
    session_id: "sess_1",
    turn_id: turnId,
    role: "assistant",
    message_type: sessionUpdate,
    created_at: "2026-08-04T21:07:00.000Z",
    raw_json: {
      type: "acp",
      session_id: "sess_1",
      frame: {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "sess_1",
          update: {
            sessionUpdate,
            status,
            title: "terminal",
            toolCallId: "tool_1",
          },
        },
      },
    },
  };
}

describe("compact tool history", () => {
  it("merges summary and terminal references without losing completion or turn identity", () => {
    const events = mergeEvents(
      normalizeHistoryMessages([
        {
          message_id: "tool",
          session_id: "session",
          turn_id: "turn",
          message_type: "tool_call",
          tool: {
            tool_call_id: "call",
            title: "Run tests",
            status: "completed",
          },
          has_detail: true,
          updated_at: "2026-09-16T01:00:00Z",
        },
        {
          message_id: "terminal",
          session_id: "session",
          turn_id: "turn",
          message_type: "tool_call_update",
          tool: { tool_call_id: "call", title: "", status: "" },
          has_detail: true,
          updated_at: "2026-09-16T00:59:00Z",
        },
      ]),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool_call",
      name: "Run tests",
      status: "done",
      turnId: "turn",
      historyDetails: [{ messageId: "tool" }, { messageId: "terminal" }],
    });
    expect(events[0]).not.toHaveProperty("raw_json");
  });
});
