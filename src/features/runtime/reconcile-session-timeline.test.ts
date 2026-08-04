import { describe, expect, it } from "vitest";
import { SessionEvent } from "./session-events";
import { reconcileSessionTimeline } from "./reconcile-session-timeline";

const createdAt = "2026-08-04T00:00:00.000Z";

describe("reconcileSessionTimeline", () => {
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

function user(id: string, turnId: string, content: string): SessionEvent {
  return {
    type: "user_message",
    id,
    sessionId: "sess_1",
    turnId,
    content,
    createdAt,
  };
}

function tool(id: string, turnId: string, name: string): SessionEvent {
  return {
    type: "tool_call",
    id,
    sessionId: "sess_1",
    turnId,
    name,
    status: "done",
    createdAt,
  };
}
