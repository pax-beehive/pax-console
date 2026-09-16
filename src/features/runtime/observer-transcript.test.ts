import { describe, expect, it } from "vitest";
import {
  applyObserverTranscript,
  ObserverTranscript,
} from "./session-observer";

const start = {
  type: "turn_start",
  session_id: "s",
  turn_id: "turn_1",
} as const;
const head = { ...start, type: "head", head_seq: 7 } as const;
const empty: ObserverTranscript = { turnIds: [], events: [], items: {} };
const item = (text: string, turnId = "turn_1") => ({
  type: "history_item" as const,
  session_id: "s",
  turn_id: turnId,
  item: {
    message_id: "m",
    session_id: "s",
    turn_id: turnId,
    session_seq: 7,
    role: "assistant",
    created_at: "2026-09-16T00:00:00Z",
    parts: [{ part_type: "text", part_index: 0, text }],
  },
});

describe("observer transcript ownership", () => {
  it("removes superseded projection rows at the next batch boundary", () => {
    let state = applyObserverTranscript(
      applyObserverTranscript(empty, start),
      item("raw"),
    );
    state = applyObserverTranscript(state, head);
    state = applyObserverTranscript(state, {
      type: "history_remove",
      session_id: "s",
      turn_id: "turn_1",
      message_id: "m",
    });
    expect(state.events).toHaveLength(1);
    state = applyObserverTranscript(state, head);
    expect(state.events).toEqual([]);
  });
  it("replaces a growing message at the same sequence and commits only at head", () => {
    let state = applyObserverTranscript(empty, start);
    state = applyObserverTranscript(state, item("A"));
    expect(state.events).toEqual([]);
    state = applyObserverTranscript(state, head);
    expect(state.events).toMatchObject([{ content: "A" }]);
    state = applyObserverTranscript(state, item("AB"));
    expect(state.events).toMatchObject([{ content: "A" }]);
    state = applyObserverTranscript(state, head);
    expect(state.events).toMatchObject([{ content: "AB" }]);
    expect(applyObserverTranscript(state, head)).toBe(state);
  });

  it("keeps the last committed view through an interrupted replay and rejects other turns", () => {
    let state = applyObserverTranscript(
      applyObserverTranscript(empty, start),
      item("AB"),
    );
    state = applyObserverTranscript(state, head);
    state = applyObserverTranscript(state, start);
    state = applyObserverTranscript(state, item("ABC"));
    expect(state.events).toMatchObject([{ content: "AB" }]);
    expect(applyObserverTranscript(state, item("wrong", "turn_2"))).toBe(state);
    state = applyObserverTranscript(state, head);
    expect(state.events).toMatchObject([{ content: "ABC" }]);
    expect(state.turnIds).toEqual(["turn_1"]);
  });

  it("rebuilds identically on refresh and clears ownership when changing sessions", () => {
    const replay = () =>
      applyObserverTranscript(
        applyObserverTranscript(
          applyObserverTranscript(empty, start),
          item("AB"),
        ),
        head,
      );
    expect(replay().events).toEqual(replay().events);
    const switched = applyObserverTranscript(replay(), {
      ...start,
      session_id: "other",
    });
    expect(switched.events).toEqual([]);
    expect(switched.turnIds).toEqual([]);
  });
});
