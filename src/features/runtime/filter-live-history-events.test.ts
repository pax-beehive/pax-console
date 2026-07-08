import { describe, expect, it } from "vitest";
import { filterLiveEventsAlreadyInHistory } from "./filter-live-history-events";
import { SessionEvent } from "./session-events";

describe("filterLiveEventsAlreadyInHistory", () => {
  it("filters a streamed live message after REST history returns the full message", () => {
    const historyEvents: SessionEvent[] = [
      {
        type: "agent_message",
        id: "msg_history_1",
        sessionId: "sess_1",
        content: "Hello from the streamed response.",
        createdAt: "2026-07-07T12:00:03.000Z",
      },
    ];
    const liveEvents: SessionEvent[] = [
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "Hello from ",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-07-07T12:00:01.000Z",
      },
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "the streamed response.",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-07-07T12:00:02.000Z",
      },
    ];

    expect(filterLiveEventsAlreadyInHistory(liveEvents, historyEvents)).toEqual(
      [],
    );
  });

  it("filters live text when REST history is restored from stored chunks", () => {
    const historyEvents: SessionEvent[] = [
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "Stored ",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-07-07T12:00:01.000Z",
      },
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "chunk response.",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-07-07T12:00:02.000Z",
      },
    ];
    const liveEvents: SessionEvent[] = [
      {
        type: "agent_message",
        id: "msg_live_1",
        sessionId: "sess_1",
        content: "Stored chunk response.",
        createdAt: "2026-07-07T12:00:03.000Z",
      },
    ];

    expect(filterLiveEventsAlreadyInHistory(liveEvents, historyEvents)).toEqual(
      [],
    );
  });

  it("keeps merged live chunks while REST history is still empty", () => {
    const liveEvents: SessionEvent[] = [
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "Hello ",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-07-07T12:00:01.000Z",
      },
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "there.",
        streaming: true,
        sessionUpdate: "agent_message_chunk",
        createdAt: "2026-07-07T12:00:02.000Z",
      },
    ];

    expect(filterLiveEventsAlreadyInHistory(liveEvents, [])).toMatchObject([
      {
        type: "agent_message",
        id: "sess_1:agent_message_chunk:turn_1",
        sessionId: "sess_1",
        content: "Hello there.",
      },
    ]);
  });
});
