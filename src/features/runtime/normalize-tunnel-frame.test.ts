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
      },
    ]);
    expect(firstMessage).toMatchObject([
      {
        type: "agent_message",
        id: `77921871-8997-4d7c-b3a7-9bdf3dd7c492:agent_message_chunk:${streamId}`,
        sessionId: "77921871-8997-4d7c-b3a7-9bdf3dd7c492",
        content: "Hey",
        streaming: true,
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
