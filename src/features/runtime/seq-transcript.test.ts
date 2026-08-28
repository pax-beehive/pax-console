import { describe, expect, it } from "vitest";

import { HistoryMessage } from "@/features/api/types";

import {
  isBehind,
  localMaxSeq,
  mergeSeqTranscript,
  seqOf,
} from "./seq-transcript";

function msg(
  messageId: string,
  sessionSeq: number,
  parts: string[] = [],
  extra: Partial<HistoryMessage> = {},
): HistoryMessage {
  return {
    message_id: messageId,
    session_seq: sessionSeq,
    parts: parts.map((text, i) => ({ part_index: i, part_type: "text", text })),
    ...extra,
  } as HistoryMessage;
}

describe("mergeSeqTranscript", () => {
  it("orders items by session_seq ascending regardless of input order", () => {
    const out = mergeSeqTranscript([msg("c", 3), msg("a", 1), msg("b", 2)]);
    expect(out.map((m) => m.message_id)).toEqual(["a", "b", "c"]);
  });

  it("dedups by message_id, keeping the more complete copy at the same seq", () => {
    // A live snapshot ("aaaa") and the durable, fuller copy ("aaaa\nbbbb") of the
    // same message (same seq) must collapse to the fuller one.
    const out = mergeSeqTranscript([
      msg("m1", 5, ["aaaa"]),
      msg("m1", 5, ["aaaa\nbbbb"]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].parts?.[0].text).toBe("aaaa\nbbbb");
  });

  it("keeps live and durable copies of a message as one slot (no duplicates)", () => {
    const out = mergeSeqTranscript([
      msg("dur", 1, ["hi"]),
      msg("tool", 2),
      msg("dur", 1, ["hi there"]), // durable refetch of the same message_id
    ]);
    expect(out.map((m) => m.message_id)).toEqual(["dur", "tool"]);
    expect(out[0].parts?.[0].text).toBe("hi there");
  });

  it("orders seqless items (seq 0) stably by id", () => {
    const out = mergeSeqTranscript([
      msg("b", 0, [], { id: 20 }),
      msg("a", 0, [], { id: 10 }),
    ]);
    expect(out.map((m) => m.message_id)).toEqual(["a", "b"]);
  });

  it("ignores items without a message_id", () => {
    const out = mergeSeqTranscript([
      { session_seq: 1 } as HistoryMessage,
      msg("a", 2),
    ]);
    expect(out.map((m) => m.message_id)).toEqual(["a"]);
  });
});

describe("staleness helpers", () => {
  it("computes local max seq and behind-ness", () => {
    const items = [msg("a", 3), msg("b", 7), msg("c", 5)];
    expect(localMaxSeq(items)).toBe(7);
    expect(isBehind(9, 7)).toBe(true);
    expect(isBehind(7, 7)).toBe(false);
    expect(isBehind(4, 7)).toBe(false);
  });

  it("seqOf defaults to 0 when absent", () => {
    expect(seqOf({ message_id: "x" } as HistoryMessage)).toBe(0);
  });
});
