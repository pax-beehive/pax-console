import { describe, expect, it } from "vitest";
import type { SessionEvent } from "@/features/runtime/session-events";
import {
  normalizeEncryptedHistory,
  reconcileEncryptedTimeline,
} from "./reconcile-history";

const text = (
  id: string,
  content: string,
  turnId = "turn_1",
): SessionEvent => ({
  type: "agent_message",
  streaming: false,
  id,
  content,
  turnId,
  sessionId: "s",
  createdAt: "2026-09-30",
});
const tool = (id: string): SessionEvent => ({
  type: "tool_call",
  id,
  toolCallId: "tool_1",
  turnId: "turn_1",
  sessionId: "s",
  name: "Read",
  status: "done",
  createdAt: "2026-09-30",
});
const done = (id = "done"): SessionEvent => ({
  type: "turn_done",
  id,
  turnId: "turn_1",
  sessionId: "s",
  createdAt: "2026-09-30",
});
const contents = (events: SessionEvent[]) =>
  events.map((e) => ("content" in e ? e.content : e.type));
const timeline = (history: SessionEvent[], live: SessionEvent[]) =>
  reconcileEncryptedTimeline(history, live).timeline;

describe("encrypted timeline", () => {
  it("keeps durable order without applying legacy turn-wide text reordering", () => {
    const events = normalizeEncryptedHistory([
      {
        message_id: "a",
        session_id: "s",
        turn_id: "t",
        message_type: "agent_message_chunk",
        parts: [
          { message_id: "a", part_index: 0, part_type: "text", text: "Before" },
        ],
      },
      {
        message_id: "b",
        session_id: "s",
        turn_id: "t",
        message_type: "agent_message_chunk",
        parts: [
          { message_id: "b", part_index: 0, part_type: "text", text: "After" },
        ],
      },
      {
        message_id: "done",
        session_id: "s",
        turn_id: "t",
        message_type: "turn_done",
      },
    ]);
    expect(contents(events)).toEqual(["Before", "After", "turn_done"]);
  });
  it("does not replace a long durable turn with a truncated live suffix", () => {
    const history = Array.from({ length: 600 }, (_, i) =>
      text(`h${i}`, `Text ${i}`),
    );
    expect(timeline(history, [text("live", "Text 599")])).toEqual(history);
  });
  it("keeps live output when completion arrives before the text parts", () => {
    const live = [
      text("l1", "Before"),
      tool("lt"),
      text("l2", "After"),
      done("ld"),
    ];
    const partial = [text("h1", "Before"), tool("ht"), done()];
    const before = timeline(partial, live);
    const after = timeline(
      [text("h1", "Before"), tool("ht"), text("h2", "After"), done()],
      live,
    );
    expect(contents(before)).toEqual([
      "Before",
      "tool_call",
      "After",
      "turn_done",
    ]);
    expect(contents(after)).toEqual(contents(before));
  });
  it("updates a partial text in place without rolling back the live suffix", () => {
    for (const content of ["Hello", "Hello world", "Hello"]) {
      expect(
        timeline([text("h", content)], [text("live", "Hello world")]),
      ).toEqual([text("h", "Hello world")]);
    }
  });
  it("does not deduplicate equal responses across turns or sort by timestamp", () => {
    const history = [text("old", "OK"), done()];
    const newest = { ...text("new", "OK", "turn_2"), createdAt: "2000-01-01" };
    expect(timeline(history, [newest])).toEqual([...history, newest]);
  });
  it("preserves repeated text around tools", () => {
    const history = [text("h1", "OK"), tool("ht"), text("h2", "OK")];
    expect(
      timeline(history, [text("l1", "OK"), tool("lt"), text("l2", "OK")]),
    ).toEqual(history);
  });
  it("retains missing live content before the next matching history anchor", () => {
    expect(
      contents(
        timeline(
          [tool("ht"), text("h", "After")],
          [text("l", "Before"), tool("lt"), text("l2", "After")],
        ),
      ),
    ).toEqual(["Before", "tool_call", "After"]);
  });
  it("does not move an unmatched old suffix past a newer turn", () => {
    const history = [
      text("h", "Before"),
      done(),
      text("new", "New turn", "turn_2"),
    ];
    expect(
      contents(timeline(history, [text("l", "Before"), text("tail", "After")])),
    ).toEqual(["Before", "After", "turn_done", "New turn"]);
  });
  it("retains turnless records by identity and order", () => {
    const a = { ...text("a", "A"), turnId: undefined };
    const b = { ...text("b", "B"), turnId: undefined };
    expect(timeline([a], [a, b])).toEqual([a, b]);
  });
  it("keeps an old live suffix before its completion when the next turn also matches", () => {
    const history = [
      text("h", "Before"),
      done(),
      text("new", "New turn", "turn_2"),
    ];
    const live = [
      text("l", "Before"),
      text("tail", "After"),
      text("new_live", "New turn", "turn_2"),
    ];
    expect(contents(timeline(history, live))).toEqual([
      "Before",
      "After",
      "turn_done",
      "New turn",
    ]);
  });
});
