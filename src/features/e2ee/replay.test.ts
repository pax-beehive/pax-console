import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptEnvelope } from "./envelope";
import { loadEncryptedTurn, normalizeReplayFrame } from "./replay";
import { mergeEvents } from "../runtime/merge-session-events";
import * as transport from "./transport";
const rootKey = new Uint8Array(32).fill(7);
const route = {
  rootKey,
  userId: "user",
  agentId: "agent",
  sessionId: "session",
  keyEpoch: 1,
};
async function event(cursor: number, frames: unknown[], turn = "turn") {
  return {
    cursor,
    created_at: "2026-10-01T00:00:00Z",
    envelope: await encryptEnvelope(
      rootKey,
      "event",
      {
        record_id: `e${cursor}`,
        agent_id: "agent",
        session_id: "session",
        key_epoch: 1,
        kind: "acp_event",
      },
      new TextEncoder().encode(JSON.stringify({ turn_id: turn, frames })),
    ),
  };
}
const chunk = (text: string) => ({
  method: "session/update",
  params: {
    sessionId: "native",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text },
    },
  },
});
describe("Given encrypted turn replay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it("when a turn spans pages then fixes the snapshot head and joins every frame", async () => {
    const first = await event(20, [
      {
        id: "p",
        method: "session/prompt",
        params: { prompt: [{ type: "text", text: "question" }] },
      },
      chunk("hello "),
    ]);
    const last = await event(21, [chunk("world")]);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          code: 200,
          data: {
            events: [first],
            turn_ref: "turn",
            turn_start_cursor: 20,
            head_cursor: 21,
            next_after_cursor: 20,
            has_more: true,
            has_older: true,
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          code: 200,
          data: {
            events: [last],
            turn_ref: "turn",
            turn_start_cursor: 20,
            head_cursor: 21,
            next_after_cursor: 21,
            has_more: false,
            has_older: true,
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const page = await loadEncryptedTurn(route);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1][0])).toContain("through_cursor=21");
    expect(String(fetcher.mock.calls[1][0])).toContain("after_cursor=20");
    expect(page.headCursor).toBe(21);
    expect(page.pagination.next_before_id).toBe(20);
    expect(
      page.replayEvents.map((e) => ("content" in e ? e.content : "")),
    ).toEqual(["question", "hello world"]);
    const live = normalizeReplayFrame(
      chunk("!"),
      "session",
      { turnId: "turn" },
      "2026-10-01",
    );
    const combined = mergeEvents([...page.replayEvents, ...live]);
    expect(combined.map((e) => ("content" in e ? e.content : ""))).toEqual([
      "question",
      "hello world!",
    ]);
  });
  it("when the outer turn reference disagrees with ciphertext then rejects the replay", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          code: 200,
          data: {
            events: [await event(1, [chunk("secret")], "other")],
            turn_ref: "turn",
            turn_start_cursor: 1,
            head_cursor: 1,
            next_after_cursor: 1,
            has_more: false,
            has_older: false,
          },
        }),
      ),
    );
    await expect(loadEncryptedTurn(route)).rejects.toThrow(/turn/i);
  });
  it("when paging fails to advance then fails instead of looping", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          code: 200,
          data: {
            events: [],
            turn_ref: "turn",
            turn_start_cursor: 1,
            head_cursor: 3,
            next_after_cursor: 0,
            has_more: true,
            has_older: false,
          },
        }),
      ),
    );
    await expect(loadEncryptedTurn(route)).rejects.toThrow(/advance/i);
  });
  it("when replaying a prompt then uses the optimistic prompt identity", () => {
    const events = normalizeReplayFrame(
      {
        id: "p",
        method: "session/prompt",
        params: { prompt: [{ type: "text", text: "question" }] },
      },
      "session",
      { turnId: "turn" },
      "2026-10-01",
    );
    expect(events[0]).toMatchObject({
      type: "user_message",
      id: "session:user:p",
      content: "question",
      turnId: "turn",
    });
  });

  it("when replaying an attachment-only prompt then restores its file metadata", () => {
    const events = normalizeReplayFrame(
      {
        id: "p",
        method: "session/prompt",
        params: {
          prompt: [],
          paxEncryptedAttachments: [
            {
              attachment_id: "file",
              filename: "private.txt",
              content_type: "text/plain",
              size_bytes: 42,
            },
          ],
        },
      },
      "session",
      { turnId: "turn" },
      "2026-10-01",
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "user_message",
      content: "",
      attachments: [
        {
          attachmentId: "file",
          filename: "private.txt",
          contentType: "text/plain",
          sizeBytes: 42,
        },
      ],
    });
  });

  it("when loading an older turn then sends its exclusive boundary", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        code: 200,
        data: {
          events: [await event(1, [chunk("older")], "old")],
          turn_ref: "old",
          turn_start_cursor: 1,
          head_cursor: 20,
          next_after_cursor: 1,
          has_more: false,
          has_older: false,
        },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const page = await loadEncryptedTurn({ ...route, beforeId: 10 });
    expect(String(fetcher.mock.calls[0][0])).toContain("before_turn=10");
    expect(page.turnRef).toBe("old");
    expect(page.pagination.has_more).toBe(false);
  });

  it("when supplementing legacy prompts then excludes newer indexed turns", async () => {
    vi.spyOn(transport, "loadEncryptedSessionHistory").mockResolvedValue({
      messages: ["legacy", "indexed"].map((turn) => ({
        message_id: `${turn}:prompt`,
        session_id: "session",
        turn_id: turn,
        role: "user",
        message_type: "user_message",
        parts: [],
      })),
      pagination: { has_more: false, next_before_id: 0 },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          code: 200,
          data: {
            events: [await event(1, [chunk("older")], "legacy")],
            turn_ref: "",
            turn_start_cursor: 1,
            head_cursor: 20,
            next_after_cursor: 1,
            has_more: false,
            has_older: false,
          },
        }),
      ),
    );
    const page = await loadEncryptedTurn({ ...route, beforeId: 10 });
    expect(page.messages.map((m) => m.turn_id)).toEqual(["legacy"]);
  });

  it("when cancelled between pages then does not fetch the rest of the turn", async () => {
    const controller = new AbortController();
    const response = Response.json({
      code: 200,
      data: {
        events: [await event(1, [chunk("prefix")])],
        turn_ref: "turn",
        turn_start_cursor: 1,
        head_cursor: 2,
        next_after_cursor: 1,
        has_more: true,
        has_older: false,
      },
    });
    const fetcher = vi.fn().mockImplementation(async () => {
      controller.abort();
      return response;
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(
      loadEncryptedTurn({ ...route, signal: controller.signal }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
