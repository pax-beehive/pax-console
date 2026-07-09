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

  it("marks only the last agent message in a turn for action controls", () => {
    const events: SessionEvent[] = [
      {
        type: "user_message",
        id: "user-1",
        sessionId: "sess_1",
        content: "fix the image",
        createdAt: "2026-07-09T04:29:00Z",
      },
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will inspect the image.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "view_image",
        status: "done",
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "agent_message",
        id: "agent-2",
        sessionId: "sess_1",
        content: "I updated the image.",
        createdAt: "2026-07-09T04:29:03Z",
      },
      {
        type: "user_message",
        id: "user-2",
        sessionId: "sess_1",
        content: "the arrow is still off",
        createdAt: "2026-07-09T04:30:00Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      { type: "event", id: "user-1", showActions: undefined },
      { type: "event", id: "agent-1", showActions: undefined },
      { type: "tool_group", id: "tool_group:tool-1" },
      { type: "event", id: "agent-2", showActions: true },
      { type: "event", id: "user-2", showActions: undefined },
    ]);
  });

  it("marks an agent message when a done run status ends the turn", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "Done.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
        createdAt: "2026-07-09T04:29:02Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      { type: "event", id: "agent-1", showActions: true },
    ]);
  });
});
