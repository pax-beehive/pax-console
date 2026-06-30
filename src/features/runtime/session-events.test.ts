import { describe, expect, it } from "vitest";
import {
  groupWorkstreamEvents,
  isVisibleTimelineEvent,
  SessionEvent,
} from "./session-events";

describe("isVisibleTimelineEvent", () => {
  it("hides run status and token usage control events from the workstream", () => {
    const events: SessionEvent[] = [
      {
        type: "user_message",
        id: "user-1",
        sessionId: "sess_1",
        content: "hello",
        createdAt: "2026-06-26T12:00:00Z",
      },
      {
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "running",
        createdAt: "2026-06-26T12:00:01Z",
      },
      {
        type: "token_usage",
        id: "usage-1",
        sessionId: "sess_1",
        totalTokens: 12,
        createdAt: "2026-06-26T12:00:02Z",
      },
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "hi",
        createdAt: "2026-06-26T12:00:03Z",
      },
    ];

    expect(
      events.filter(isVisibleTimelineEvent).map((event) => event.type),
    ).toEqual(["user_message", "agent_message"]);
  });
});

describe("groupWorkstreamEvents", () => {
  it("groups adjacent tool call events and ends the group at the next visible event", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will inspect files.",
        createdAt: "2026-06-26T12:00:00Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "Read",
        status: "running",
        createdAt: "2026-06-26T12:00:01Z",
      },
      {
        type: "tool_call",
        id: "tool-2",
        sessionId: "sess_1",
        name: "Grep",
        status: "done",
        createdAt: "2026-06-26T12:00:02Z",
      },
      {
        type: "progress",
        id: "thought-1",
        sessionId: "sess_1",
        content: "Found the relevant file.",
        createdAt: "2026-06-26T12:00:03Z",
      },
      {
        type: "tool_call",
        id: "tool-3",
        sessionId: "sess_1",
        name: "Edit",
        status: "queued",
        createdAt: "2026-06-26T12:00:04Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      {
        type: "event",
        id: "agent-1",
      },
      {
        type: "tool_group",
        id: "tool_group:tool-1",
        events: [
          { id: "tool-1", name: "Read", status: "running" },
          { id: "tool-2", name: "Grep", status: "done" },
        ],
      },
      {
        type: "event",
        id: "thought-1",
      },
      {
        type: "tool_group",
        id: "tool_group:tool-3",
        events: [{ id: "tool-3", name: "Edit", status: "queued" }],
      },
    ]);
  });
});
