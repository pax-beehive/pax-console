import { describe, expect, it } from "vitest";
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
            typeof nextStatus === "function" ? nextStatus(status) : nextStatus;
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

  it("keeps repeated ACP text chunks from the same stream", () => {
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
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "agent_message",
      content: "Hello",
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
      "第一",
      "梯队",
      "：",
      "最",
      "主流",
      "\n\n",
      "####",
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
