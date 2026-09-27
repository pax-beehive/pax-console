import { describe, expect, it } from "vitest";
import { SessionEvent } from "./session-events";
import {
  historySnapshotsForTimeline,
  reconcileSessionTimeline,
} from "./reconcile-session-timeline";

const createdAt = "2026-08-04T00:00:00.000Z";

describe("reconcileSessionTimeline", () => {
  it("keeps unknown active turns conservative but retains snapshots after activity ends", () => {
    expect(
      historySnapshotsForTimeline(["turn_1"], {
        localStatus: "streaming",
        sessionStatus: "idle",
      }),
    ).toEqual([]);
    expect(
      historySnapshotsForTimeline(["turn_1"], {
        localStatus: "idle",
        sessionStatus: "running",
      }),
    ).toEqual([]);
    expect(
      historySnapshotsForTimeline(["turn_1"], {
        localStatus: "done",
        localTurnId: "turn_1",
        sessionStatus: "idle",
        sessionTurnId: "turn_1",
      }),
    ).toEqual(["turn_1"]);
    expect(
      historySnapshotsForTimeline(undefined, {
        localStatus: "idle",
        sessionStatus: "idle",
      }),
    ).toEqual([]);
  });
  it.each([
    {
      localStatus: "streaming",
      localTurnId: "pending-turn:2",
      sessionStatus: "idle",
      sessionTurnId: "turn_1",
    },
    {
      localStatus: "streaming",
      localTurnId: "turn_2",
      sessionStatus: "running",
      sessionTurnId: "turn_1",
    },
    {
      localStatus: "waiting_approval",
      localTurnId: "turn_2",
      sessionStatus: "running",
      sessionTurnId: "turn_2",
    },
    {
      localStatus: "done",
      localTurnId: "turn_1",
      sessionStatus: "running",
      sessionTurnId: "turn_2",
    },
    {
      localStatus: "idle",
      sessionStatus: "cancelling",
      sessionTurnId: "turn_2",
    },
  ])(
    "retains the previous complete snapshot when another turn starts: %j",
    (runtime) => {
      const history = [
        user("prompt-1", "turn_1", "First prompt"),
        event("agent_message", "reply-1", "turn_1", "Complete previous reply"),
      ];
      const stale = [user("live-prompt-1", "turn_1", "First prompt")];
      const oldSnapshot = ["turn_1"];
      const before = reconcileSessionTimeline(
        history,
        stale,
        [],
        [],
        [],
        historySnapshotsForTimeline(oldSnapshot, {
          localStatus: "done",
          sessionStatus: "idle",
        }),
      );
      const nextTurnId =
        runtime.localStatus === "streaming" ||
        runtime.localStatus === "waiting_approval"
          ? runtime.localTurnId!
          : "turn_2";
      const conversation = [
        ...stale,
        user("prompt-2", nextTurnId, "Next prompt"),
        event("agent_message", "reply-2", nextTurnId, "New reply"),
      ];
      const after = reconcileSessionTimeline(
        history,
        conversation,
        [],
        [],
        [],
        historySnapshotsForTimeline(oldSnapshot, runtime),
      );
      expect(before.timeline.map((e) => e.id)).toEqual(["prompt-1", "reply-1"]);
      expect(after.timeline.map((e) => e.id)).toEqual([
        "prompt-1",
        "reply-1",
        "prompt-2",
        "reply-2",
      ]);
    },
  );

  it("lets the active turn stream while keeping other history snapshots authoritative", () => {
    const snapshots = historySnapshotsForTimeline(["turn_1", "turn_2"], {
      localStatus: "streaming",
      localTurnId: "turn_2",
      sessionStatus: "running",
      sessionTurnId: "turn_2",
    });
    const history = [
      event("agent_message", "old-final", "turn_1", "Complete previous reply"),
      event(
        "agent_message",
        "current-snapshot",
        "turn_2",
        "Outdated current reply",
      ),
    ];
    const live = [
      event("agent_message", "old-partial", "turn_1", "Old partial"),
      event(
        "agent_message",
        "current-live",
        "turn_2",
        "Current streaming reply",
      ),
    ];
    expect(
      reconcileSessionTimeline(
        history,
        live,
        [],
        [],
        [],
        snapshots,
      ).timeline.map((e) => e.id),
    ).toEqual(["old-final", "current-live"]);
  });

  it("keeps one attachment-bearing user bubble when history replaces the live prompt", () => {
    const attachments = [
      { filename: "Screenshot.png", contentType: "image/png" },
    ];
    const durable: SessionEvent = {
      ...user("history-user", "turn_1", "See screenshot"),
      attachments,
    };
    const live: SessionEvent = {
      ...user("live-user", "turn_1", "See screenshot"),
      attachments,
    };
    const result = reconcileSessionTimeline([durable], [live]);
    expect(result.timeline).toEqual([durable]);
  });
  it("replaces fragmented live text with a committed observer turn snapshot", () => {
    const history = [
      user("older", "turn_0", "Earlier"),
      user("prompt", "turn_1", "Now"),
      event("agent_message", "partial", "turn_1", "A"),
    ];
    const live = [
      event("agent_message", "live-a", "turn_1", "A"),
      tool("live-tool", "turn_1", "terminal"),
      event("agent_message", "live-b", "turn_1", "B"),
    ];
    const snapshot = [
      user("prompt", "turn_1", "Now"),
      event("agent_message", "durable", "turn_1", "AB"),
      tool("durable-tool", "turn_1", "terminal"),
    ];
    const result = reconcileSessionTimeline(history, live, snapshot, [
      "turn_1",
    ]);
    expect(result.timeline.map((item) => item.id)).toEqual([
      "older",
      "prompt",
      "durable",
      "durable-tool",
    ]);
    expect(result.liveEvents.map((item) => item.id)).not.toContain("live-a");
  });

  it("hands an observer snapshot back to completed history", () => {
    const history = [
      event("agent_message", "final", "turn_1", "ABC"),
      {
        type: "turn_done",
        id: "done",
        turnId: "turn_1",
        sessionId: "sess_1",
        createdAt,
      } as SessionEvent,
    ];
    const snapshot = [event("agent_message", "stale", "turn_1", "AB")];
    expect(
      reconcileSessionTimeline(history, [], snapshot, ["turn_1"]).timeline,
    ).toEqual(history);
  });

  it("keeps the durable user prompt while conversation owns agent output", () => {
    const history = [
      user("history-user", "turn_1", "Please investigate"),
      event("agent_message", "history-partial", "turn_1", "Hello"),
    ];
    const conversation = [
      event("agent_message", "live-complete", "turn_1", "Hello there"),
    ];

    const result = reconcileSessionTimeline(history, conversation, []);

    expect(result.timeline.map((item) => item.id)).toEqual([
      "history-user",
      "live-complete",
    ]);
  });

  it("keeps a conversation-owned turn at its durable history position", () => {
    const history = [
      user("turn-1-user", "turn_1", "First prompt"),
      event("agent_message", "turn-1-partial", "turn_1", "First partial"),
      user("turn-2-user", "turn_2", "Second prompt"),
      event("agent_message", "turn-2-answer", "turn_2", "Second answer"),
    ];
    const conversation = [
      event("agent_message", "turn-1-live", "turn_1", "First answer"),
    ];

    const result = reconcileSessionTimeline(history, conversation, []);

    expect(result.timeline.map((item) => item.id)).toEqual([
      "turn-1-user",
      "turn-1-live",
      "turn-2-user",
      "turn-2-answer",
    ]);
  });

  it("keeps an observer turn at its durable history position", () => {
    const history = [
      user("turn-1-user", "turn_1", "First prompt"),
      event("agent_message", "turn-1-prefix", "turn_1", "First prefix"),
      user("turn-2-user", "turn_2", "Second prompt"),
      event("agent_message", "turn-2-answer", "turn_2", "Second answer"),
    ];
    const observer = [
      tool("turn-1-tool", "turn_1", "terminal"),
      event("agent_message", "turn-1-tail", "turn_1", "First tail"),
    ];

    const result = reconcileSessionTimeline(history, [], observer);

    expect(result.timeline.map((item) => item.id)).toEqual([
      "turn-1-user",
      "turn-1-prefix",
      "turn-1-tool",
      "turn-1-tail",
      "turn-2-user",
      "turn-2-answer",
    ]);
  });

  it("appends observer replay after the conversation prefix", () => {
    const conversation = [
      user("conversation-user", "turn_1", "Please investigate"),
      event("agent_message", "conversation-prefix", "turn_1", "Checking"),
    ];
    const observer = [
      event("agent_message", "observer-replay", "turn_1", "Checking"),
      tool("observer-tool", "turn_1", "terminal"),
      event("agent_message", "observer-tail", "turn_1", "Done"),
    ];

    const result = reconcileSessionTimeline([], conversation, observer);

    expect(result.timeline.map((item) => item.id)).toEqual([
      "conversation-user",
      "conversation-prefix",
      "observer-tool",
      "observer-tail",
    ]);
  });

  it("atomically hands a completed live turn to durable history", () => {
    const history = [
      event("agent_message", "history-complete", "turn_1", "Hello there"),
      done("history-done", "turn_1"),
    ];
    const live = [
      event("agent_message", "live-complete", "turn_1", "Hello there"),
      done("live-done", "turn_1"),
    ];

    const result = reconcileSessionTimeline(history, live, []);

    expect(result.liveEvents).toEqual([]);
    expect(result.timeline.map((item) => item.id)).toEqual([
      "history-complete",
      "history-done",
    ]);
  });

  it("keeps identical text from different turns", () => {
    const history = [
      event("agent_message", "history-turn-1", "turn_1", "Same answer"),
      done("history-turn-1-done", "turn_1"),
    ];
    const live = [
      event("agent_message", "live-turn-2", "turn_2", "Same answer"),
    ];

    const result = reconcileSessionTimeline(history, live, []);

    expect(result.timeline.map((item) => item.id)).toEqual([
      "history-turn-1",
      "history-turn-1-done",
      "live-turn-2",
    ]);
  });

  it("retains legacy exact-text filtering without turn IDs", () => {
    const history = [event("agent_message", "history", undefined, "Hello")];
    const live = [event("agent_message", "live", undefined, "Hello")];

    const result = reconcileSessionTimeline(history, live, []);

    expect(result.liveEvents).toEqual([]);
    expect(result.timeline.map((item) => item.id)).toEqual(["history"]);
  });

  it("treats optimistic pending turn IDs as legacy until adopted", () => {
    const history = [event("agent_message", "history", undefined, "Hello")];
    const live = [event("agent_message", "live", "pending-turn:1", "Hello")];

    const result = reconcileSessionTimeline(history, live, []);

    expect(result.liveEvents).toEqual([]);
    expect(result.timeline.map((item) => item.id)).toEqual(["history"]);
  });

  it("keeps an older pending user prompt ahead of a later adopted turn", () => {
    const live = [
      userAt(
        "pending-user",
        "pending-turn:1",
        "First prompt",
        "2026-08-04T00:00:00.000Z",
      ),
      userAt(
        "turn-2-user",
        "turn_2",
        "Second prompt",
        "2026-08-04T00:00:10.000Z",
      ),
      eventAt(
        "agent_message",
        "turn-2-answer",
        "turn_2",
        "Second answer",
        "2026-08-04T00:00:11.000Z",
      ),
    ];

    const result = reconcileSessionTimeline([], live, []);

    expect(result.timeline.map((item) => item.id)).toEqual([
      "pending-user",
      "turn-2-user",
      "turn-2-answer",
    ]);
  });

  it("keeps a legacy thought chunk between same-turn work events", () => {
    const live: SessionEvent[] = [
      toolAt("tool-1", "turn_1", "terminal", "2026-08-04T00:00:01.000Z"),
      progressAt(
        "thought-legacy",
        undefined,
        "Checking the result",
        "2026-08-04T00:00:02.000Z",
      ),
      toolAt("tool-2", "turn_1", "read", "2026-08-04T00:00:03.000Z"),
    ];

    const result = reconcileSessionTimeline([], live, []);

    expect(result.timeline.map((item) => item.id)).toEqual([
      "tool-1",
      "thought-legacy",
      "tool-2",
    ]);
  });
});

function event(
  type: "agent_message",
  id: string,
  turnId: string | undefined,
  content: string,
): SessionEvent {
  return eventAt(type, id, turnId, content, createdAt);
}

function eventAt(
  type: "agent_message",
  id: string,
  turnId: string | undefined,
  content: string,
  eventCreatedAt: string,
): SessionEvent {
  return {
    type,
    id,
    sessionId: "sess_1",
    ...(turnId ? { turnId } : {}),
    content,
    createdAt: eventCreatedAt,
  };
}

function done(id: string, turnId: string): SessionEvent {
  return {
    type: "turn_done",
    id,
    sessionId: "sess_1",
    turnId,
    createdAt,
  };
}

function user(
  id: string,
  turnId: string,
  content: string,
): Extract<SessionEvent, { type: "user_message" }> {
  return userAt(id, turnId, content, createdAt);
}

function userAt(
  id: string,
  turnId: string,
  content: string,
  eventCreatedAt: string,
): Extract<SessionEvent, { type: "user_message" }> {
  return {
    type: "user_message",
    id,
    sessionId: "sess_1",
    turnId,
    content,
    createdAt: eventCreatedAt,
  };
}

function tool(id: string, turnId: string, name: string): SessionEvent {
  return toolAt(id, turnId, name, createdAt);
}

function toolAt(
  id: string,
  turnId: string,
  name: string,
  eventCreatedAt: string,
): SessionEvent {
  return {
    type: "tool_call",
    id,
    sessionId: "sess_1",
    turnId,
    name,
    status: "done",
    createdAt: eventCreatedAt,
  };
}

function progressAt(
  id: string,
  turnId: string | undefined,
  content: string,
  eventCreatedAt: string,
): SessionEvent {
  return {
    type: "progress",
    id,
    sessionId: "sess_1",
    ...(turnId ? { turnId } : {}),
    content,
    streaming: true,
    sessionUpdate: "agent_thought_chunk",
    createdAt: eventCreatedAt,
  };
}
