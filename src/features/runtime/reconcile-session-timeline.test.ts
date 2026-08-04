import { describe, expect, it } from "vitest";
import { SessionEvent } from "./session-events";
import { reconcileSessionTimeline } from "./reconcile-session-timeline";

const createdAt = "2026-08-04T00:00:00.000Z";

describe("reconcileSessionTimeline", () => {
  it("renders only the live representation while a turn is running", () => {
    const history = [
      event("agent_message", "history-partial", "turn_1", "Hello"),
    ];
    const live = [
      event("agent_message", "live-complete", "turn_1", "Hello there"),
    ];

    const result = reconcileSessionTimeline(history, live);

    expect(result.timeline.map((item) => item.id)).toEqual(["live-complete"]);
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

    const result = reconcileSessionTimeline(history, live);

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

    const result = reconcileSessionTimeline(history, live);

    expect(result.timeline.map((item) => item.id)).toEqual([
      "history-turn-1",
      "history-turn-1-done",
      "live-turn-2",
    ]);
  });

  it("retains legacy exact-text filtering without turn IDs", () => {
    const history = [event("agent_message", "history", undefined, "Hello")];
    const live = [event("agent_message", "live", undefined, "Hello")];

    const result = reconcileSessionTimeline(history, live);

    expect(result.liveEvents).toEqual([]);
    expect(result.timeline.map((item) => item.id)).toEqual(["history"]);
  });

  it("treats optimistic pending turn IDs as legacy until adopted", () => {
    const history = [event("agent_message", "history", undefined, "Hello")];
    const live = [event("agent_message", "live", "pending-turn:1", "Hello")];

    const result = reconcileSessionTimeline(history, live);

    expect(result.liveEvents).toEqual([]);
    expect(result.timeline.map((item) => item.id)).toEqual(["history"]);
  });
});

function event(
  type: "agent_message",
  id: string,
  turnId: string | undefined,
  content: string,
): SessionEvent {
  return {
    type,
    id,
    sessionId: "sess_1",
    ...(turnId ? { turnId } : {}),
    content,
    createdAt,
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
