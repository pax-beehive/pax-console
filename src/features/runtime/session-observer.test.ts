import { Mock, afterEach, describe, expect, it, vi } from "vitest";
import {
  SessionObserverEnvelope,
  SessionObserverStatus,
  handleSessionObserverEnvelope,
  parseSessionObserverSseBlock,
  streamSessionObserver,
  streamSessionObserverWithReconnect,
  streamSessionObserverWithQueuedReplay,
} from "./session-observer";
import { SessionEvent } from "./session-events";

describe("handleSessionObserverEnvelope", () => {
  it("preserves the business turn on ACP events and emits turn_done", () => {
    let status: SessionObserverStatus = "observing";
    let events: SessionEvent[] = [];
    const onTurnDone = vi.fn();
    const options = {
      onTurnDone,
      setError: () => undefined,
      setEvents: (
        nextEvents:
          | SessionEvent[]
          | ((current: SessionEvent[]) => SessionEvent[]),
      ) => {
        events =
          typeof nextEvents === "function" ? nextEvents(events) : nextEvents;
      },
      setStatus: (
        nextStatus:
          | SessionObserverStatus
          | ((current: SessionObserverStatus) => SessionObserverStatus),
      ) => {
        status =
          typeof nextStatus === "function" ? nextStatus(status) : nextStatus;
      },
      streamId: "sess_1:observe",
    };

    handleSessionObserverEnvelope(
      {
        type: "acp",
        session_id: "sess_1",
        turn_id: "turn_1",
        frame: {
          jsonrpc: "2.0",
          method: "session/update",
          params: {
            sessionId: "sess_1",
            update: {
              content: { text: "Working", type: "text" },
              sessionUpdate: "agent_thought_chunk",
            },
          },
        },
      },
      options,
    );
    handleSessionObserverEnvelope(
      {
        type: "turn_done",
        session_id: "sess_1",
        turn_id: "turn_1",
      },
      options,
    );

    expect(status).toBe("done");
    expect(events).toMatchObject([
      { type: "progress", turnId: "turn_1" },
      { type: "turn_done", turnId: "turn_1" },
    ]);
    expect(onTurnDone).toHaveBeenCalledWith("turn_1");
  });
});

describe("parseSessionObserverSseBlock", () => {
  it("parses no-running and turn completion envelopes", () => {
    const noRunning = parseSessionObserverSseBlock(
      'data: {"type":"no_running_turn","session_id":"sess_1","status":"idle"}',
    );
    const done = parseSessionObserverSseBlock(
      'data: {"type":"turn_done","session_id":"sess_1","turn_id":"turn_1","status":"done"}',
    );

    expect(noRunning).toEqual({
      type: "no_running_turn",
      session_id: "sess_1",
      status: "idle",
    });
    expect(done).toEqual({
      type: "turn_done",
      session_id: "sess_1",
      status: "done",
      turn_id: "turn_1",
    });
  });
});

describe("streamSessionObserver", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("gets session events with an optional message trim cursor", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        streamFromChunks([
          'data: {"type":"buffer_miss","session_id":"sess_1","message_id":"msg_1"}\n\n',
          'data: {"type":"turn_done","session_id":"sess_1","turn_id":"turn_1"}\n\n',
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const envelopes: SessionObserverEnvelope[] = [];
    const onConnected = vi.fn();

    await streamSessionObserver({
      afterMessageId: "msg_1",
      agentId: "agent_1",
      onConnected,
      onEnvelope: (envelope) => envelopes.push(envelope),
      sessionId: "sess_1",
      userId: "self",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(onConnected).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock as Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "/api/pax/api/v1/user/self/agents/agent_1/sessions/sess_1/events?after_message_id=msg_1",
    );
    expect(init.method).toBe("GET");
    expect(init.headers).toEqual({ Accept: "text/event-stream" });
    expect(envelopes).toEqual([
      {
        type: "buffer_miss",
        session_id: "sess_1",
        message_id: "msg_1",
      },
      {
        type: "turn_done",
        session_id: "sess_1",
        turn_id: "turn_1",
      },
    ]);
  });

  it("reads split live ACP observer envelopes", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        streamFromChunks([
          'data: {"type":"acp","session_id":"sess_1","message_id":"msg_2","frame":{"jsonrpc":"2.0","method":"session/update",',
          '"params":{"sessionId":"sess_1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"hi"}}}}}\n\n',
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const envelopes: SessionObserverEnvelope[] = [];

    await streamSessionObserver({
      agentId: "agent_1",
      onEnvelope: (envelope) => envelopes.push(envelope),
      sessionId: "sess_1",
      userId: "self",
    });

    expect(envelopes).toMatchObject([
      {
        type: "acp",
        session_id: "sess_1",
        message_id: "msg_2",
      },
    ]);
  });

  it("reconnects through the idle gap and replays a queued follow-up turn", async () => {
    const responses = [
      'data: {"type":"turn_done","session_id":"sess_1","turn_id":"turn_1"}\n\n',
      'data: {"type":"no_running_turn","session_id":"sess_1","status":"idle"}\n\n',
      [
        'data: {"type":"acp","session_id":"sess_1","turn_id":"turn_2","frame":{"jsonrpc":"2.0","method":"session/prompt","params":{"sessionId":"sess_1"}}}\n\n',
        'data: {"type":"acp","session_id":"sess_1","turn_id":"turn_2","frame":{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"queued output"}}}}}\n\n',
        'data: {"type":"turn_done","session_id":"sess_1","turn_id":"turn_2"}\n\n',
      ].join(""),
    ];
    const fetchMock = vi.fn(
      async () =>
        new Response(streamFromChunks([responses.shift() ?? ""]), {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const envelopes: SessionObserverEnvelope[] = [];
    const onQueuedTurnStarted = vi.fn();
    const onQueuedTurnFinished = vi.fn();

    await streamSessionObserverWithQueuedReplay({
      afterMessageId: "msg_previous_turn",
      agentId: "agent_1",
      followQueuedTurn: true,
      onEnvelope: (envelope) => envelopes.push(envelope),
      onQueuedTurnFinished,
      onQueuedTurnStarted,
      retryDelayMs: 0,
      sessionId: "sess_1",
      userId: "self",
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onQueuedTurnStarted).toHaveBeenCalledOnce();
    expect(onQueuedTurnFinished).toHaveBeenCalledOnce();
    expect((fetchMock as Mock).mock.calls[0]?.[0]).toContain(
      "after_message_id=msg_previous_turn",
    );
    expect((fetchMock as Mock).mock.calls[1]?.[0]).not.toContain(
      "after_message_id",
    );
    expect((fetchMock as Mock).mock.calls[2]?.[0]).not.toContain(
      "after_message_id",
    );
    expect(envelopes.map((envelope) => envelope.type)).toEqual([
      "turn_done",
      "no_running_turn",
      "acp",
      "acp",
      "turn_done",
    ]);
  });

  it("reconnects after a browser network error and keeps observing", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("NetworkError"))
      .mockResolvedValueOnce(
        new Response(
          streamFromChunks([
            'data: {"type":"acp","session_id":"sess_1","turn_id":"turn_1","frame":{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"sess_1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"continued"}}}}}\n\n',
            'data: {"type":"turn_done","session_id":"sess_1","turn_id":"turn_1"}\n\n',
          ]),
          {
            headers: { "content-type": "text/event-stream" },
            status: 200,
          },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const envelopes: SessionObserverEnvelope[] = [];
    const onReconnect = vi.fn();

    await streamSessionObserverWithReconnect({
      afterMessageId: "msg_1",
      agentId: "agent_1",
      maxReconnectAttempts: 1,
      onEnvelope: (envelope) => envelopes.push(envelope),
      onReconnect,
      reconnectDelayMs: 0,
      sessionId: "sess_1",
      userId: "self",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(envelopes.map((envelope) => envelope.type)).toEqual([
      "acp",
      "turn_done",
    ]);
    expect((fetchMock as Mock).mock.calls[1]?.[0]).toContain(
      "after_message_id=msg_1",
    );
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
