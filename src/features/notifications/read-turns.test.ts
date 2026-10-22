import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "@/features/runtime/session-events";
import { completedReplyTargets, turnNotificationId } from "./read-turns";

const reply = (
  turnId: string,
  id = turnId,
  content = "Final reply",
): SessionEvent => ({
  type: "agent_message",
  id,
  content,
  turnId,
  sessionId: "session",
  createdAt: "2026-10-21T00:00:00Z",
});
const done = (turnId: string): SessionEvent => ({
  type: "turn_done",
  id: `done:${turnId}`,
  turnId,
  sessionId: "session",
  createdAt: "2026-10-21T00:00:00Z",
});

describe("completed reply notification identity", () => {
  it("matches Manager's Go JSON/SHA256 contract, including HTML and Unicode escaping", async () => {
    vi.stubGlobal("crypto", webcrypto);
    try {
      expect(
        await turnNotificationId(
          "usr_one",
          "agent_one",
          "session_one",
          "turn_one",
        ),
      ).toBe(
        "ntf_c7d867a0e700d09be71a83529ee7c00cfcd98de06a3681edfe27794c3c0b7d7c",
      );
      expect(
        await turnNotificationId(
          "user<&>",
          "agent\u2028line\u2029",
          '会话/"\\',
          "turn\n\t\b\f\r\x00",
        ),
      ).toBe(
        "ntf_085f6bb6bb24524315402f7f042d19ef4a82e4b600c034f3099067feb40f6607",
      );
      const original = await turnNotificationId("u", "a", "s", "t");
      for (const ids of [
        ["other", "a", "s", "t"],
        ["u", "other", "s", "t"],
        ["u", "a", "other", "t"],
        ["u", "a", "s", "other"],
      ])
        expect(
          await turnNotificationId(
            ...(ids as [string, string, string, string]),
          ),
        ).not.toBe(original);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("targets only the final rendered reply after its durable completion has synced", () => {
    const history = [
      reply("old", "early", "Working"),
      reply("old", "final"),
      done("old"),
      reply("new"),
    ];
    const rendered = [...history, done("new")];
    expect([...completedReplyTargets(history, rendered, "session")]).toEqual([
      ["final", "old"],
    ]);
    // A terminal signal alone must not acknowledge a partial live reply.
    expect([
      ...completedReplyTargets([done("old")], rendered, "session"),
    ]).toEqual([]);
    expect([
      ...completedReplyTargets(
        history,
        [reply("old", "live", "Partial")],
        "session",
      ),
    ]).toEqual([]);
    expect([
      ...completedReplyTargets(history, rendered, "other-session"),
    ]).toEqual([]);
    expect([
      ...completedReplyTargets(
        [reply("old", "empty", " "), done("old")],
        rendered,
        "session",
      ),
    ]).toEqual([]);
    expect([
      ...completedReplyTargets(
        [reply("old"), done("old")],
        [reply("old", "live")],
        "session",
      ),
    ]).toEqual([["live", "old"]]);
  });
});
