import { describe, expect, it, vi } from "vitest";
import type { AgentSession, HistoryMessage } from "../api/types";
import { listSessionHistory } from "../api/resources";
import {
  emptyHistorySync,
  mergeSyncedHistory,
  syncSessionHistory,
} from "./session-history-sync";
import { reconcileSessionTimeline } from "./reconcile-session-timeline";
import { normalizeHistoryMessages } from "./normalize-history-message";

const message = (
  id: string,
  seq: number,
  turn = "turn",
  kind = "agent_message_chunk",
  text = id,
): HistoryMessage => ({
  message_id: id,
  session_id: "s",
  session_seq: seq,
  turn_id: turn,
  message_type: kind,
  role: kind === "user" ? "user" : "assistant",
  created_at: "2026-09-17T00:00:00Z",
  raw_json: { text_layout: "segment" },
  parts: [{ part_index: 0, part_type: "text", text }],
});
const page = (messages: HistoryMessage[], pagination = {}) => ({
  messages,
  pagination,
});
const session: AgentSession = {
  session_id: "s",
  agent_id: "a",
  node_id: "n",
  runtime_status: "idle",
  latest_message_id: "done",
  latest_message_seq: 4,
  latest_turn_id: "turn",
};
const args = {
  userId: "self",
  sessionId: "s",
  history: [] as HistoryMessage[],
};

describe("history calibration", () => {
  it("catches up from the second newest sequence and replaces the entire completed turn", async () => {
    const prompt = message("prompt", 1, "turn", "user");
    const partial = message(
      "reply",
      2,
      "turn",
      "agent_message_chunk",
      "partial",
    );
    const final = message(
      "reply",
      2,
      "turn",
      "agent_message_chunk",
      "complete",
    );
    const tool = message("tool", 3, "turn", "tool_call");
    const done = message("done", 4, "turn", "turn_done");
    const read = vi
      .fn<typeof listSessionHistory>()
      .mockResolvedValueOnce(page([final, tool, done]))
      .mockResolvedValueOnce(
        page([tool, done], { has_older: true, next_before_seq: 3 }),
      )
      .mockResolvedValueOnce(page([prompt, final]));
    const sync = await syncSessionHistory({
      ...args,
      history: [prompt, partial],
      session,
      read,
    });
    expect(read.mock.calls[0][3]).toEqual({ afterSeq: 1 });
    expect(read.mock.calls[1][3]).toEqual({ turnId: "turn", beforeSeq: 0 });
    expect(read.mock.calls[2][3]).toEqual({ turnId: "turn", beforeSeq: 3 });
    expect(sync.calibratedTurnIds).toEqual(["turn"]);
    expect(mergeSyncedHistory([prompt, partial], sync)).toEqual([
      prompt,
      final,
      tool,
      done,
    ]);
    const timeline = reconcileSessionTimeline(
      normalizeHistoryMessages(mergeSyncedHistory([partial], sync)),
      normalizeHistoryMessages([partial]),
      [],
      [],
      sync.calibratedTurnIds,
    ).timeline;
    expect(timeline).toContainEqual(
      expect.objectContaining({ content: "complete" }),
    );
    expect(timeline).not.toContainEqual(
      expect.objectContaining({ content: "partial" }),
    );
  });

  it("does not publish a partial turn if a later page fails", async () => {
    const current = { messages: [message("old", 1)], calibratedTurnIds: [] };
    const read = vi
      .fn<typeof listSessionHistory>()
      .mockResolvedValueOnce(
        page([message("done", 4, "turn", "turn_done")], {
          has_older: true,
          next_before_seq: 4,
        }),
      )
      .mockRejectedValueOnce(new Error("offline"));
    await expect(
      syncSessionHistory({ ...args, current, turnIds: ["turn"], read }),
    ).rejects.toThrow("offline");
    expect(current.calibratedTurnIds).toEqual([]);
    expect(current.messages.map((m) => m.message_id)).toEqual(["old"]);
  });

  it("calibrates idle history even if the final message ID is already known", async () => {
    const done = message("done", 4, "turn", "turn_done");
    const read = vi
      .fn<typeof listSessionHistory>()
      .mockResolvedValueOnce(page([message("reply", 2), done]));
    const sync = await syncSessionHistory({
      ...args,
      history: [done],
      session,
      read,
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][3]).toEqual({ turnId: "turn", beforeSeq: 0 });
    expect(sync.calibratedTurnIds).toEqual(["turn"]);
    await syncSessionHistory({
      ...args,
      history: [done],
      session,
      current: sync,
      read: read.mockResolvedValue(page([message("reply", 2), done])),
    });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("leaves running turns on their live connection and retries missing completion later", async () => {
    const read = vi
      .fn<typeof listSessionHistory>()
      .mockResolvedValue(page([message("reply", 2)]));
    await syncSessionHistory({
      ...args,
      session: { ...session, runtime_status: "running" },
      read,
    });
    expect(read).not.toHaveBeenCalled();
    const sync = await syncSessionHistory({ ...args, turnIds: ["turn"], read });
    expect(sync.calibratedTurnIds).toEqual([]);
    expect(sync.messages).toEqual([]);
  });

  it("revalidates same-ID content outside the tail window with an unchanged idle head", async () => {
    const old = message("reply", 1, "turn", "agent_message_chunk", "partial");
    const updated = {
      ...old,
      parts: [{ part_index: 0, part_type: "text", text: "complete answer" }],
    };
    const removed = message("removed", 2);
    const tool = message("tool", 3, "turn", "tool_call");
    const done = message("done", 4, "turn", "turn_done");
    const current = {
      messages: [old, removed, tool, done],
      calibratedTurnIds: ["turn"],
    };
    const read = vi
      .fn<typeof listSessionHistory>()
      .mockResolvedValueOnce(
        page([tool, done], { has_older: true, next_before_seq: 3 }),
      )
      .mockResolvedValueOnce(page([updated]));
    const sync = await syncSessionHistory({ ...args, session, current, read });
    expect(read.mock.calls.map((call) => call[3])).toEqual([
      { turnId: "turn", beforeSeq: 0 },
      { turnId: "turn", beforeSeq: 3 },
    ]);
    expect(sync.messages).toEqual([tool, done, updated]);
    expect(sync.calibratedTurnIds).toEqual(["turn"]);
    const timeline = reconcileSessionTimeline(
      normalizeHistoryMessages(mergeSyncedHistory([old, removed], sync)),
      normalizeHistoryMessages([old]),
      [],
      [],
      sync.calibratedTurnIds,
    ).timeline;
    expect(timeline).toContainEqual(
      expect.objectContaining({ content: "complete answer" }),
    );
    expect(timeline).not.toContainEqual(
      expect.objectContaining({ content: "partial" }),
    );
  });

  it("keeps a calibrated snapshot when revalidation fails and retries the same head", async () => {
    const old = message("reply", 1, "turn", "agent_message_chunk", "partial");
    const updated = message(
      "reply",
      1,
      "turn",
      "agent_message_chunk",
      "complete",
    );
    const done = message("done", 4, "turn", "turn_done");
    const current = { messages: [old, done], calibratedTurnIds: ["turn"] };
    const read = vi
      .fn<typeof listSessionHistory>()
      .mockResolvedValueOnce(
        page([done], { has_older: true, next_before_seq: 4 }),
      )
      .mockRejectedValueOnce(new Error("offline"));
    await expect(
      syncSessionHistory({ ...args, session, current, read }),
    ).rejects.toThrow("offline");
    expect(current.messages).toEqual([old, done]);
    read.mockResolvedValueOnce(page([updated, done]));
    const next = await syncSessionHistory({ ...args, session, current, read });
    expect(next.messages).toEqual([updated, done]);
  });

  it("revalidates a calibrated tail turn on resume while another turn runs", async () => {
    const old = message("reply", 1);
    const updated = message(
      "reply",
      1,
      "turn",
      "agent_message_chunk",
      "updated part",
    );
    const done = message("done", 4, "turn", "turn_done");
    const current = { messages: [old, done], calibratedTurnIds: ["turn"] };
    const read = vi
      .fn<typeof listSessionHistory>()
      .mockResolvedValueOnce(page([done]))
      .mockResolvedValueOnce(page([updated, done]));
    const next = await syncSessionHistory({
      ...args,
      session: { ...session, runtime_status: "running" },
      current,
      refreshTail: true,
      read,
    });
    expect(next.messages).toEqual([updated, done]);
  });

  it("does not let late partial history erase calibrated content or unrelated older pages", () => {
    const final = message(
      "reply",
      2,
      "turn",
      "agent_message_chunk",
      "complete",
    );
    const older = message("older", 1, "older");
    const sync = { messages: [final], calibratedTurnIds: ["turn"] };
    expect(mergeSyncedHistory([older, message("reply", 2)], sync)).toEqual([
      older,
      final,
    ]);
    expect(emptyHistorySync.messages).toEqual([]);
  });
});
