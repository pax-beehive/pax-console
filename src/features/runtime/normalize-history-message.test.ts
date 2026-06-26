import { describe, expect, it } from "vitest";
import { normalizeHistoryMessage } from "./normalize-history-message";

describe("normalizeHistoryMessage", () => {
  it("restores aggregated text from ordered message parts", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_1",
      session_id: "sess_1",
      role: "assistant",
      created_at: "2026-06-19T16:00:00.000Z",
      parts: [
        {
          message_id: "msg_1",
          part_index: 1,
          part_type: "text",
          text: "好",
        },
        {
          message_id: "msg_1",
          part_index: 0,
          part_type: "text",
          text: "你",
        },
      ],
    });

    expect(events).toMatchObject([
      {
        type: "agent_message",
        id: "msg_1",
        sessionId: "sess_1",
        content: "你好",
      },
    ]);
  });

  it("restores thought parts as progress events", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_2",
      session_id: "sess_1",
      role: "assistant",
      created_at: "2026-06-19T16:00:00.000Z",
      parts: [
        {
          message_id: "msg_2",
          part_index: 0,
          part_type: "agent_thought",
          text: "Need to inspect the repo.",
        },
      ],
    });

    expect(events).toMatchObject([
      {
        type: "progress",
        id: "msg_2:thought",
        sessionId: "sess_1",
        content: "Need to inspect the repo.",
      },
    ]);
  });

  it("uses message_type to restore text parts as progress events", () => {
    const events = normalizeHistoryMessage({
      message_id: "msg_3",
      session_id: "sess_1",
      message_type: "thought",
      role: "assistant",
      created_at: "2026-06-19T16:00:00.000Z",
      parts: [
        {
          message_id: "msg_3",
          part_index: 0,
          part_type: "text",
          text: "Thinking from stored history.",
        },
      ],
    });

    expect(events).toMatchObject([
      {
        type: "progress",
        id: "msg_3:thought",
        sessionId: "sess_1",
        content: "Thinking from stored history.",
      },
    ]);
  });
});
