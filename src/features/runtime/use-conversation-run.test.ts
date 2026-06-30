import { describe, expect, it } from "vitest";
import {
  ConversationRunStatus,
  handleConversationEnvelope,
} from "./use-conversation-run";
import { SessionEvent } from "./session-events";

describe("handleConversationEnvelope", () => {
  it("keeps SSE business errors recoverable for the next prompt", () => {
    let sessionId = "";
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];

    handleConversationEnvelope(
      {
        type: "error",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
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
            typeof nextStatus === "function"
              ? nextStatus(status)
              : nextStatus;
        },
        streamId: "sess_1:turn:1",
      },
    );

    expect(sessionId).toBe("sess_1");
    expect(error).toMatchObject({
      name: "ConversationRunError",
      message: "ACP request idle timed out: session/prompt",
    });
    expect(status).toBe("error");
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
            typeof nextStatus === "function"
              ? nextStatus(status)
              : nextStatus;
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

  it("emits a run status event when the conversation is done", () => {
    let sessionId = "";
    let error: Error | null = null;
    let status: ConversationRunStatus = "streaming";
    let events: SessionEvent[] = [];

    handleConversationEnvelope(
      {
        type: "done",
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

    expect(sessionId).toBe("");
    expect(status).toBe("done");
    expect(events).toMatchObject([
      {
        type: "run_status",
        id: "sess_1:done",
        sessionId: "sess_1",
        status: "done",
      },
    ]);
  });

  it("ignores duplicate ACP events from the same stream", () => {
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
      content: "Hello",
      id: "sess_1:agent_message_chunk:sess_1:turn:1",
    });
  });
});

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
