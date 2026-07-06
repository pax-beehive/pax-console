import { describe, expect, it } from "vitest";
import { mergeEvents } from "./merge-session-events";
import { normalizeTunnelFrame } from "./normalize-tunnel-frame";

describe("normalizeTunnelFrame", () => {
  it("normalizes ACP streaming thought and message chunks from session/update", () => {
    const streamId = "sess_1:turn:1";
    const firstThought = normalizeTunnelFrame(
      sessionUpdate("agent_thought_chunk", " I"),
      { streamId },
    );
    const secondThought = normalizeTunnelFrame(
      sessionUpdate("agent_thought_chunk", " should"),
      { streamId },
    );
    const firstMessage = normalizeTunnelFrame(
      sessionUpdate("agent_message_chunk", "Hey"),
      { streamId },
    );
    const secondMessage = normalizeTunnelFrame(
      sessionUpdate("agent_message_chunk", " Todd"),
      { streamId },
    );

    expect(firstThought).toMatchObject([
      {
        type: "progress",
        id: `77921871-8997-4d7c-b3a7-9bdf3dd7c492:agent_thought_chunk:${streamId}`,
        sessionId: "77921871-8997-4d7c-b3a7-9bdf3dd7c492",
        content: " I",
        streaming: true,
        sessionUpdate: "agent_thought_chunk",
      },
    ]);
    expect(firstMessage).toMatchObject([
      {
        type: "agent_message",
        id: `77921871-8997-4d7c-b3a7-9bdf3dd7c492:agent_message_chunk:${streamId}`,
        sessionId: "77921871-8997-4d7c-b3a7-9bdf3dd7c492",
        content: "Hey",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
      },
    ]);

    const merged = mergeEvents([
      ...firstThought,
      ...secondThought,
      ...firstMessage,
      ...secondMessage,
    ]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      type: "progress",
      content: " I should",
    });
    expect(merged[1]).toMatchObject({
      type: "agent_message",
      content: "Hey Todd",
    });
  });

  it("uses a stable stream id for message delta frames without explicit ids", () => {
    const streamId = "sess_1:turn:2";
    const firstDelta = normalizeTunnelFrame(
      {
        entity_type: "message",
        event_type: "delta",
        session_id: "sess_1",
        role: "assistant",
        content: "Hel",
      },
      { streamId },
    );
    const secondDelta = normalizeTunnelFrame(
      {
        entity_type: "message",
        event_type: "delta",
        session_id: "sess_1",
        role: "assistant",
        content: "lo",
      },
      { streamId },
    );

    expect(firstDelta).toMatchObject([
      {
        type: "agent_message",
        id: `sess_1:delta:${streamId}`,
        sessionId: "sess_1",
        content: "Hel",
        streaming: true,
      },
    ]);

    const merged = mergeEvents([...firstDelta, ...secondDelta]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "agent_message",
      id: `sess_1:delta:${streamId}`,
      content: "Hello",
    });
  });

  it("uses a stable stream id for message/delta frames without explicit ids", () => {
    const streamId = "sess_1:turn:3";
    const firstDelta = normalizeTunnelFrame(
      {
        type: "message/delta",
        session_id: "sess_1",
        role: "assistant",
        delta: "He",
      },
      { streamId },
    );
    const secondDelta = normalizeTunnelFrame(
      {
        type: "message/delta",
        session_id: "sess_1",
        role: "assistant",
        delta: "y",
      },
      { streamId },
    );

    const merged = mergeEvents([...firstDelta, ...secondDelta]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "agent_message",
      id: `sess_1:message/delta:${streamId}`,
      content: "Hey",
    });
  });

  it("aggregates streaming chunks by session and session update without a turn id", () => {
    const firstDelta = normalizeTunnelFrame(
      sessionUpdate("agent_message_chunk", "你"),
    );
    const secondDelta = normalizeTunnelFrame(
      sessionUpdate("agent_message_chunk", "好"),
    );

    const merged = mergeEvents([...firstDelta, ...secondDelta]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "agent_message",
      id: "77921871-8997-4d7c-b3a7-9bdf3dd7c492:agent_message_chunk",
      content: "你好",
    });
  });

  it("normalizes conversation run usage updates and final prompt results", () => {
    const streamId = "sess_f859:turn:1";
    const chunk = normalizeTunnelFrame(
      withSessionEnvelope(
        "sess_f859",
        sessionUpdate("agent_message_chunk", "?"),
      ),
      { streamId },
    );
    const usageUpdate = normalizeTunnelFrame(
      withSessionEnvelope("sess_f859", {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "sess_f859",
          update: {
            sessionUpdate: "usage_update",
            size: 1_000_000,
            used: 14_863,
          },
        },
      }),
    );
    const finalResult = normalizeTunnelFrame(
      withSessionEnvelope("sess_f859", {
        id: 3,
        result: {
          usage: {
            inputTokens: 13_984,
            totalTokens: 14_061,
            outputTokens: 77,
            thoughtTokens: 0,
            cachedReadTokens: 2_048,
          },
          stopReason: "end_turn",
        },
        jsonrpc: "2.0",
      }),
    );

    expect(chunk).toMatchObject([
      {
        type: "agent_message",
        sessionId: "sess_f859",
        content: "?",
        streaming: true,
      },
    ]);
    expect(usageUpdate).toMatchObject([
      {
        type: "token_usage",
        sessionId: "sess_f859",
        totalTokens: 14_863,
      },
    ]);
    expect(finalResult).toMatchObject([
      {
        type: "token_usage",
        sessionId: "sess_f859",
        inputTokens: 13_984,
        outputTokens: 77,
        reasoningTokens: 0,
        totalTokens: 14_061,
      },
      {
        type: "run_status",
        sessionId: "sess_f859",
        status: "done",
      },
    ]);
  });

  it("normalizes live pax invocation session updates", () => {
    const events = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_live",
        update: {
          message_id: "msg_invocation_live",
          message_type: "pax:invocation",
          parent_message_id: "msg_tool_done",
          raw_json: {
            invocation_id: "inv_live",
            invocation_type: "agent_conversation",
            phase: "reply",
            side: "target",
            replaces_message_ids: ["msg_tool_call", "msg_tool_done"],
            sender: {
              agent_name: "Review Agent",
              agent_user_name: "Grace",
            },
            receiver: {
              agent_name: "Contract Writer",
              agent_user_name: "Ada",
            },
            content: {
              display_text: "Agent B replied with contract feedback.",
              original_text: "The contract should include retry details.",
            },
          },
        },
      },
    });

    expect(events).toMatchObject([
      {
        type: "invocation",
        id: "msg_invocation_live",
        sessionId: "sess_live",
        content: "Agent B replied with contract feedback.",
        originalContent: "The contract should include retry details.",
        invocationId: "inv_live",
        invocationType: "agent_conversation",
        phase: "reply",
        side: "target",
        parentMessageId: "msg_tool_done",
        replacesMessageIds: ["msg_tool_call", "msg_tool_done"],
        sender: { agentName: "Review Agent", userName: "Grace" },
        receiver: { agentName: "Contract Writer", userName: "Ada" },
      },
    ]);
  });

  it("normalizes live pax invocation pending session updates", () => {
    const events = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_live",
        update: {
          message_id: "msg_invocation_pending",
          message_type: "pax:invocation_pending",
          raw_json: {
            invocation_id: "inv_live",
            invocation_type: "agent_conversation",
            phase: "inquiry",
            side: "source",
            receiver: {
              agent_id: "agent_b",
              representative_agent_id: "rep_target",
            },
            content: {
              display_text: "Asked Review Agent for input.",
              original_text: "Please review the request contract.",
            },
          },
        },
      },
    });

    expect(events).toMatchObject([
      {
        type: "invocation",
        id: "msg_invocation_pending",
        sessionId: "sess_live",
        state: "pending",
        content: "Asked Review Agent for input.",
        originalContent: "Please review the request contract.",
        receiver: {
          agentId: "agent_b",
          representativeAgentId: "rep_target",
        },
      },
    ]);
  });

  it("normalizes ACP permission requests from official session/request_permission frames", () => {
    const events = normalizeTunnelFrame({
      jsonrpc: "2.0",
      id: "perm-1",
      method: "session/request_permission",
      params: {
        sessionId: "sess-acp-runtime",
        approval_id: "appr-1",
        toolCall: {
          toolCallId: "call-1",
          kind: "execute",
          title: "go test ./...",
          rawInput: {
            command: "go test ./...",
          },
        },
        options: [
          { optionId: "allow", kind: "allow_once", name: "Allow" },
          { optionId: "reject", kind: "reject_once", name: "Reject" },
        ],
      },
    });

    expect(events).toMatchObject([
      {
        type: "permission_request",
        id: "perm-1",
        sessionId: "sess-acp-runtime",
        approvalId: "appr-1",
        requestId: "perm-1",
        title: "go test ./...",
        toolCallId: "call-1",
        toolKind: "execute",
        rawInput: {
          command: "go test ./...",
        },
        options: [
          { optionId: "allow", kind: "allow_once", name: "Allow" },
          { optionId: "reject", kind: "reject_once", name: "Reject" },
        ],
      },
    ]);
  });

  it("normalizes ACP tool update and output session updates as tool call rows", () => {
    const toolUpdate = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_1",
        update: {
          name: "Read",
          sessionUpdate: "tool_update",
          status: "running",
        },
      },
    });
    const toolOutput = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_1",
        update: {
          name: "Read",
          result: {
            text: "done",
          },
          sessionUpdate: "tool_output",
          status: "done",
        },
      },
    });

    expect(toolUpdate).toMatchObject([
      {
        type: "tool_call",
        sessionId: "sess_1",
        name: "Read",
        status: "running",
      },
    ]);
    expect(toolOutput).toMatchObject([
      {
        type: "tool_call",
        sessionId: "sess_1",
        name: "Read",
        status: "done",
        output: {
          text: "done",
        },
      },
    ]);
  });

  it("merges ACP tool_call updates by toolCallId instead of appending rows", () => {
    const started = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_c9ac",
        update: {
          content: [
            {
              content: {
                text: '$ sleep 5 && echo "睡醒了！"',
                type: "text",
              },
              type: "content",
            },
          ],
          kind: "execute",
          locations: [],
          sessionUpdate: "tool_call",
          title: 'terminal: sleep 5 && echo "睡醒了！"',
          toolCallId: "tc-d4d628ddf0bc",
        },
      },
    });
    const completed = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_c9ac",
        update: {
          content: [
            {
              content: {
                text: "terminal result\n- **output:** 睡醒了！\n- **exit_code:** 0",
                type: "text",
              },
              type: "content",
            },
          ],
          kind: "execute",
          sessionUpdate: "tool_call_update",
          status: "completed",
          toolCallId: "tc-d4d628ddf0bc",
        },
      },
    });

    expect(started).toMatchObject([
      {
        type: "tool_call",
        id: "sess_c9ac:tool:tc-d4d628ddf0bc",
        sessionId: "sess_c9ac",
        name: 'terminal: sleep 5 && echo "睡醒了！"',
        status: "running",
        sessionUpdate: "tool_call",
        toolCallId: "tc-d4d628ddf0bc",
      },
    ]);
    expect(completed).toMatchObject([
      {
        type: "tool_call",
        id: "sess_c9ac:tool:tc-d4d628ddf0bc",
        sessionId: "sess_c9ac",
        status: "done",
        sessionUpdate: "tool_call_update",
        toolCallId: "tc-d4d628ddf0bc",
      },
    ]);

    const merged = mergeEvents([...started, ...completed]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "tool_call",
      id: "sess_c9ac:tool:tc-d4d628ddf0bc",
      name: 'terminal: sleep 5 && echo "睡醒了！"',
      status: "done",
      toolCallId: "tc-d4d628ddf0bc",
      output: [
        {
          content: {
            text: "terminal result\n- **output:** 睡醒了！\n- **exit_code:** 0",
            type: "text",
          },
          type: "content",
        },
      ],
    });
  });

  it("merges tool updates by toolCallId when session ids differ", () => {
    const started = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      session_id: "sess_manager",
      params: {
        sessionId: "native_session",
        update: {
          content: [
            { content: { text: "cmd", type: "text" }, type: "content" },
          ],
          sessionUpdate: "tool_call",
          title: "terminal: cmd",
          toolCallId: "tc-shared",
        },
      },
    });
    const completed = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      session_id: "native_session",
      params: {
        sessionId: "native_session",
        update: {
          content: [
            {
              content: { text: "terminal result", type: "text" },
              type: "content",
            },
          ],
          sessionUpdate: "tool_call_update",
          toolCallId: "tc-shared",
        },
      },
    });

    expect(completed).toMatchObject([
      {
        type: "tool_call",
        status: "done",
        toolCallId: "tc-shared",
      },
    ]);

    const merged = mergeEvents([...started, ...completed]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "tool_call",
      id: "sess_manager:tool:tc-shared",
      sessionId: "sess_manager",
      name: "terminal: cmd",
      status: "done",
      output: [
        {
          content: { text: "terminal result", type: "text" },
          type: "content",
        },
      ],
    });
  });

  it("joins consecutive ACP tool call content chunks", () => {
    const firstChunk = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_1",
        update: {
          content: {
            text: "line ",
            type: "text",
          },
          sessionUpdate: "tool_call_content_chunk",
          title: "read: /tmp/tttt/secret.txt",
          toolCallId: "tc-read",
        },
      },
    });
    const secondChunk = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_1",
        update: {
          content: {
            text: "one",
            type: "text",
          },
          sessionUpdate: "tool_call_content_chunk",
          title: "read: /tmp/tttt/secret.txt",
          toolCallId: "tc-read",
        },
      },
    });

    expect(firstChunk).toMatchObject([
      {
        type: "tool_call",
        id: "sess_1:tool:tc-read",
        sessionId: "sess_1",
        name: "read: /tmp/tttt/secret.txt",
        status: "running",
        sessionUpdate: "tool_call_content_chunk",
        toolCallId: "tc-read",
        output: {
          text: "line ",
          type: "text",
        },
      },
    ]);

    const merged = mergeEvents([...firstChunk, ...secondChunk]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      type: "tool_call",
      id: "sess_1:tool:tc-read",
      name: "read: /tmp/tttt/secret.txt",
      status: "running",
      sessionUpdate: "tool_call_content_chunk",
      toolCallId: "tc-read",
      output: "line one",
    });
  });

  it("ignores non-display ACP session updates instead of rendering raw frame content", () => {
    const rawUpdate = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_1",
        update: {
          sessionUpdate: "update",
          content: {
            text: '{"method":"session/update","params":{"update":true}}',
            type: "text",
          },
        },
      },
    });
    const unknownOutputUpdate = normalizeTunnelFrame({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "sess_1",
        update: {
          output: "internal status update",
          sessionUpdate: "available_commands_update",
        },
      },
    });

    expect(rawUpdate).toStrictEqual([]);
    expect(unknownOutputUpdate).toStrictEqual([]);
  });
});

function sessionUpdate(sessionUpdate: string, text: string) {
  return {
    jsonrpc: "2.0",
    method: "session/update",
    params: {
      sessionId: "77921871-8997-4d7c-b3a7-9bdf3dd7c492",
      update: {
        content: {
          text,
          type: "text",
        },
        sessionUpdate,
      },
    },
  };
}

function withSessionEnvelope(
  sessionId: string,
  frame: Record<string, unknown>,
) {
  return {
    ...frame,
    session_id: sessionId,
    sessionId,
  };
}
