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
});
