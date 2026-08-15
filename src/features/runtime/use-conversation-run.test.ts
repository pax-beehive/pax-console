import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors";
import {
  ConversationRunStatus,
  handleConversationEnvelope,
} from "./use-conversation-run";
import { mergeEvents } from "./merge-session-events";
import { SessionEvent } from "./session-events";

describe("handleConversationEnvelope", () => {
  it("keeps SSE business errors recoverable for the next prompt", () => {
    let sessionId = "";
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];

    const envelopeError = handleConversationEnvelope(
      {
        type: "error",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
        status_code: 504,
        message: "ACP request idle timed out: session/prompt",
      },
      {
        onSession: (nextSessionId) => {
          sessionId = nextSessionId;
        },
        setError: (nextError) => {
          error =
            typeof nextError === "function" ? nextError(error) : nextError;
        },
        setEvents: (nextEvents) => {
          events =
            typeof nextEvents === "function" ? nextEvents(events) : nextEvents;
        },
        setStatus: (nextStatus) => {
          status =
            typeof nextStatus === "function" ? nextStatus(status) : nextStatus;
        },
        streamId: "sess_1:turn:1",
      },
    );

    expect(sessionId).toBe("sess_1");
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      name: "ApiError",
      status: 504,
      message: "ACP request idle timed out: session/prompt",
    });
    expect(status).toBe("error");
    expect(envelopeError).toBe(error);
    expect(events).toMatchObject([
      {
        type: "run_status",
        sessionId: "sess_1",
        status: "error",
      },
    ]);

    handleConversationEnvelope(
      {
        type: "done",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
      },
      {
        onSession: (nextSessionId) => {
          sessionId = nextSessionId;
        },
        setError: (nextError) => {
          error =
            typeof nextError === "function" ? nextError(error) : nextError;
        },
        setEvents: (nextEvents) => {
          events =
            typeof nextEvents === "function" ? nextEvents(events) : nextEvents;
        },
        setStatus: (nextStatus) => {
          status =
            typeof nextStatus === "function" ? nextStatus(status) : nextStatus;
        },
        streamId: "sess_1:turn:1",
      },
    );

    expect(status).toBe("error");
  });

  it("reassigns optimistic pending-session events when the session id arrives", () => {
    let sessionId = "";
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [
      {
        type: "user_message",
        id: "pending-session:user:1",
        sessionId: "pending-session",
        content: "hello",
        createdAt: "2026-06-30T12:00:00.000Z",
      },
    ];

    handleConversationEnvelope(
      {
        type: "session",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
      },
      handlers({
        getError: () => error,
        getEvents: () => events,
        getStatus: () => status,
        setError: (nextError) => {
          error = nextError;
        },
        setEvents: (nextEvents) => {
          events = nextEvents;
        },
        setSessionId: (nextSessionId) => {
          sessionId = nextSessionId;
        },
        setStatus: (nextStatus) => {
          status = nextStatus;
        },
      }),
    );

    expect(sessionId).toBe("sess_1");
    expect(events).toMatchObject([
      {
        type: "user_message",
        id: "sess_1:user:1",
        sessionId: "sess_1",
        content: "hello",
      },
    ]);
  });

  it("reassigns an optimistic turn when the business turn starts", () => {
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [
      {
        type: "user_message",
        id: "sess_1:user:1",
        sessionId: "sess_1",
        turnId: "pending-turn:1",
        content: "hello",
        createdAt: "2026-06-30T12:00:00.000Z",
      },
    ];
    let activeTurnId = "";
    const handlerOptions = {
      ...handlers({
        getError: () => error,
        getEvents: () => events,
        getStatus: () => status,
        setError: (nextError) => {
          error = nextError;
        },
        setEvents: (nextEvents) => {
          events = nextEvents;
        },
        setSessionId: () => undefined,
        setStatus: (nextStatus) => {
          status = nextStatus;
        },
      }),
      fallbackTurnId: "pending-turn:1",
      onTurnStarted: (turnId: string) => {
        activeTurnId = turnId;
      },
    };

    handleConversationEnvelope(
      {
        type: "turn_started",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
        turn_id: "turn_1",
      },
      handlerOptions,
    );

    expect(activeTurnId).toBe("turn_1");
    expect(events).toMatchObject([
      { type: "user_message", turnId: "turn_1" },
      { type: "run_status", turnId: "turn_1", status: "running" },
    ]);
  });

  it("carries the envelope turn id into normalized ACP events", () => {
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [
      {
        type: "user_message",
        id: "sess_1:user:1",
        sessionId: "sess_1",
        turnId: "pending-turn:1",
        content: "hello",
        createdAt: "2026-06-30T12:00:00.000Z",
      },
    ];
    let activeTurnId = "";

    handleConversationEnvelope(
      {
        ...acpTextChunkEnvelope({
          sessionId: "sess_1",
          text: "Hello",
        }),
        turn_id: "turn_1",
      },
      {
        ...handlers({
          getError: () => error,
          getEvents: () => events,
          getStatus: () => status,
          setError: (nextError) => {
            error = nextError;
          },
          setEvents: (nextEvents) => {
            events = nextEvents;
          },
          setSessionId: () => undefined,
          setStatus: (nextStatus) => {
            status = nextStatus;
          },
        }),
        fallbackTurnId: "pending-turn:1",
        onTurnStarted: (turnId: string) => {
          activeTurnId = turnId;
        },
      },
    );

    expect(activeTurnId).toBe("turn_1");
    expect(events).toMatchObject([
      { type: "user_message", turnId: "turn_1" },
      {
        type: "agent_message",
        turnId: "turn_1",
        content: "Hello",
      },
    ]);
  });

  it("completes a business turn only from turn_done", () => {
    let sessionId = "";
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];
    let completedTurns = 0;

    handleConversationEnvelope(
      {
        type: "turn_done",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
        turn_id: "turn_1",
      },
      {
        ...handlers({
          getError: () => error,
          getEvents: () => events,
          getStatus: () => status,
          setError: (nextError) => {
            error = nextError;
          },
          setEvents: (nextEvents) => {
            events = nextEvents;
          },
          setSessionId: (nextSessionId) => {
            sessionId = nextSessionId;
          },
          setStatus: (nextStatus) => {
            status = nextStatus;
          },
        }),
        onTurnDone: () => {
          completedTurns += 1;
        },
      },
    );

    expect(sessionId).toBe("");
    expect(status).toBe("done");
    expect(completedTurns).toBe(1);
    expect(events).toMatchObject([
      {
        type: "turn_done",
        id: "sess_1:turn:turn_1:done",
        sessionId: "sess_1",
        turnId: "turn_1",
      },
    ]);
  });

  it("keeps a permission-paused turn waiting when the request stream ends", () => {
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];
    let completedTurns = 0;
    const handlerOptions = {
      ...handlers({
        getError: () => error,
        getEvents: () => events,
        getStatus: () => status,
        setError: (nextError) => {
          error = nextError;
        },
        setEvents: (nextEvents) => {
          events = nextEvents;
        },
        setSessionId: () => undefined,
        setStatus: (nextStatus) => {
          status = nextStatus;
        },
      }),
      fallbackTurnId: "turn_1",
      onTurnDone: () => {
        completedTurns += 1;
      },
    };

    handleConversationEnvelope(
      {
        type: "interrupted",
        session_id: "sess_1",
        turn_id: "turn_1",
        reason: "permission_required",
      },
      handlerOptions,
    );
    handleConversationEnvelope(
      {
        type: "done",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
      },
      handlerOptions,
    );

    expect(status).toBe("waiting_approval");
    expect(events).toEqual([]);
    expect(completedTurns).toBe(0);
  });

  it("emits an explicit turn completion event for ACP end_turn results", () => {
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];
    let completedTurns = 0;

    handleConversationEnvelope(
      {
        type: "acp",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
        frame: {
          id: 4,
          result: { stopReason: "end_turn" },
          jsonrpc: "2.0",
        },
      },
      {
        ...handlers({
          getError: () => error,
          getEvents: () => events,
          getStatus: () => status,
          setError: (nextError) => {
            error = nextError;
          },
          setEvents: (nextEvents) => {
            events = nextEvents;
          },
          setSessionId: () => undefined,
          setStatus: (nextStatus) => {
            status = nextStatus;
          },
        }),
        onTurnDone: () => {
          completedTurns += 1;
        },
      },
    );

    expect(events).toMatchObject([
      {
        type: "turn_done",
        sessionId: "sess_1",
      },
    ]);
    expect(status).toBe("done");
    expect(completedTurns).toBe(0);
  });

  it("updates a permission request when manager approval metadata arrives", () => {
    let sessionId = "";
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];
    const handlerOptions = handlers({
      getError: () => error,
      getEvents: () => events,
      getStatus: () => status,
      setError: (nextError) => {
        error = nextError;
      },
      setEvents: (nextEvents) => {
        events = nextEvents;
      },
      setSessionId: (nextSessionId) => {
        sessionId = nextSessionId;
      },
      setStatus: (nextStatus) => {
        status = nextStatus;
      },
    });

    handleConversationEnvelope(
      {
        type: "acp",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
        frame: permissionRequestFrame(),
      },
      handlerOptions,
    );
    handleConversationEnvelope(
      {
        type: "approval_required",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
        approval_id: "appr_1",
        approval: {
          approval_id: "appr_1",
          title: "Run tests",
          description: "go test ./...",
          options: [
            {
              option_id: "allow_once",
              label: "Allow once",
              decision: "allow",
              scope: "once",
            },
          ],
        },
        frame: permissionRequestFrame(),
      },
      handlerOptions,
    );

    expect(sessionId).toBe("");
    expect(status).toBe("waiting_approval");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "permission_request",
      sessionId: "sess_1",
      requestId: "perm_1",
      approvalId: "appr_1",
      title: "Run tests",
      description: "go test ./...",
      options: [
        {
          optionId: "allow_once",
          kind: "allow",
          name: "Allow once",
        },
      ],
    });
  });

  it("compacts repeated ACP text chunks into the current stream event", () => {
    let sessionId = "";
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];
    const envelope = {
      type: "acp" as const,
      node_id: "node_1",
      agent_id: "agent_1",
      session_id: "sess_1",
      frame: {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "sess_1",
          update: {
            content: {
              text: "Hello",
              type: "text",
            },
            sessionUpdate: "agent_message_chunk",
          },
        },
      },
    };
    const handlerOptions = handlers({
      getError: () => error,
      getEvents: () => events,
      getStatus: () => status,
      setError: (nextError) => {
        error = nextError;
      },
      setEvents: (nextEvents) => {
        events = nextEvents;
      },
      setSessionId: (nextSessionId) => {
        sessionId = nextSessionId;
      },
      setStatus: (nextStatus) => {
        status = nextStatus;
      },
    });

    handleConversationEnvelope(envelope, handlerOptions);
    handleConversationEnvelope(envelope, handlerOptions);

    expect(sessionId).toBe("");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "agent_message",
      content: "HelloHello",
      id: "sess_1:agent_message_chunk:sess_1:turn:1",
    });
    expect(mergeEvents(events)).toMatchObject([
      {
        type: "agent_message",
        content: "HelloHello",
        id: "sess_1:agent_message_chunk:sess_1:turn:1",
      },
    ]);
  });

  it("preserves blank-line ACP chunks before streamed markdown headings", () => {
    let sessionId = "";
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];
    const handlerOptions = handlers({
      getError: () => error,
      getEvents: () => events,
      getStatus: () => status,
      setError: (nextError) => {
        error = nextError;
      },
      setEvents: (nextEvents) => {
        events = nextEvents;
      },
      setSessionId: (nextSessionId) => {
        sessionId = nextSessionId;
      },
      setStatus: (nextStatus) => {
        status = nextStatus;
      },
    });

    for (const text of ["第一", "梯队", "：", "最", "主流", "\n\n", "####"]) {
      handleConversationEnvelope(
        acpTextChunkEnvelope({
          sessionId: "sess_1",
          text,
        }),
        handlerOptions,
      );
    }

    expect(sessionId).toBe("");
    const textEvents = events.filter(
      (event): event is Extract<SessionEvent, { type: "agent_message" }> =>
        event.type === "agent_message",
    );
    expect(textEvents.map((event) => event.content)).toEqual([
      "第一梯队：最主流\n\n####",
    ]);
    expect(mergeEvents(events)).toMatchObject([
      {
        type: "agent_message",
        content: "第一梯队：最主流\n\n####",
      },
    ]);
  });
});

function permissionRequestFrame() {
  return {
    jsonrpc: "2.0",
    id: "perm_1",
    method: "session/request_permission",
    params: {
      sessionId: "native_session",
      toolCall: {
        kind: "execute",
        title: "go test ./...",
        rawInput: {
          command: "go test ./...",
        },
        toolCallId: "call_1",
      },
      options: [
        { kind: "allow_once", name: "Allow once", optionId: "allow_once" },
        { kind: "reject_once", name: "Deny", optionId: "deny" },
      ],
    },
  };
}

function acpTextChunkEnvelope({
  sessionId,
  text,
}: {
  sessionId: string;
  text: string;
}) {
  return {
    type: "acp" as const,
    node_id: "node_1",
    agent_id: "agent_1",
    session_id: sessionId,
    frame: {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId,
        update: {
          content: {
            text,
            type: "text",
          },
          sessionUpdate: "agent_message_chunk",
        },
      },
    },
  };
}

function handlers({
  getError,
  getEvents,
  getStatus,
  setError,
  setEvents,
  setSessionId,
  setStatus,
}: {
  getError: () => Error | null;
  getEvents: () => SessionEvent[];
  getStatus: () => ConversationRunStatus;
  setError: (error: Error | null) => void;
  setEvents: (events: SessionEvent[]) => void;
  setSessionId: (sessionId: string) => void;
  setStatus: (status: ConversationRunStatus) => void;
}) {
  return {
    onSession: setSessionId,
    setError: (nextError) => {
      setError(
        typeof nextError === "function" ? nextError(getError()) : nextError,
      );
    },
    setEvents: (nextEvents) => {
      setEvents(
        typeof nextEvents === "function" ? nextEvents(getEvents()) : nextEvents,
      );
    },
    setStatus: (nextStatus) => {
      setStatus(
        typeof nextStatus === "function" ? nextStatus(getStatus()) : nextStatus,
      );
    },
    streamId: "sess_1:turn:1",
  } satisfies Parameters<typeof handleConversationEnvelope>[1];
}
