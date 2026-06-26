import { Mock, afterEach, describe, expect, it, vi } from "vitest";
import {
  ConversationRunEnvelope,
  parseConversationRunSseBlock,
  streamConversationRun,
} from "./conversation-run";

describe("parseConversationRunSseBlock", () => {
  it("parses default data messages into conversation envelopes", () => {
    const envelope = parseConversationRunSseBlock(
      'data: {"type":"session","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1"}',
    );

    expect(envelope).toEqual({
      type: "session",
      node_id: "node_1",
      agent_id: "agent_1",
      session_id: "sess_1",
    });
  });
});

describe("streamConversationRun", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts input JSON and reads split server-sent data envelopes", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        streamFromChunks([
          'data: {"type":"session","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1"}\n',
          '\ndata: {"type":"done","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1"}\n\n',
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const envelopes: ConversationRunEnvelope[] = [];

    await streamConversationRun({
      agentId: "agent_1",
      input: "hello",
      nodeId: "node_1",
      onEnvelope: (envelope) => envelopes.push(envelope),
      sessionId: "sess_existing",
      userId: "self",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock as Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "/api/pax/api/v1/user/self/nodes/node_1/agents/agent_1/conversation",
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ input: "hello", session_id: "sess_existing" }),
    );
    expect(envelopes).toEqual([
      {
        type: "session",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
      },
      {
        type: "done",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
      },
    ]);
  });
});

function streamFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}
