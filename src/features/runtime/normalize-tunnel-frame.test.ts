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
        id: `${streamId}:agent_thought_chunk`,
        sessionId: "77921871-8997-4d7c-b3a7-9bdf3dd7c492",
        content: " I",
        streaming: true,
      },
    ]);
    expect(firstMessage).toMatchObject([
      {
        type: "agent_message",
        id: `${streamId}:agent_message_chunk`,
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
