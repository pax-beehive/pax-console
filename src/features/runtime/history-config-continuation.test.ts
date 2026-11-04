import type { HistoryMessage } from "@/features/api/types";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeHistoryMessages } from "./normalize-history-message";

describe("history text continuation across configuration changes", () => {
  it.each([false, true])(
    "restores one Markdown answer across two settings changes (notification: %s)",
    (includeNotification) => {
      const chunks = [
        "**有名字、有长期记忆、能持续积累",
        "经历的 Agent 个体**？\n\n用户仍然觉得是在和同一个 Agent 合",
        "作。",
      ];
      const messages = [segment("answer-start", chunks[0], 10)];
      messages.push(
        configRequest("reasoning", 11, "reasoning_effort", "ultra"),
      );
      if (includeNotification) messages.push(configUpdate("config-update", 12));
      const continuationSeq = includeNotification ? 13 : 12;
      messages.push(segment("answer-middle", chunks[1], continuationSeq));
      messages.push(
        configRequest("fast", continuationSeq + 1, "fast-mode", "true"),
      );
      messages.push(segment("answer-end", chunks[2], continuationSeq + 2));
      const original = structuredClone(messages);

      const events = normalizeHistoryMessages(messages);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: "agent_message",
        content: chunks.join(""),
        historyTextLayout: "segment",
        streaming: false,
      });
      if (events[0].type !== "agent_message") throw new Error("Missing answer");
      const html = renderToStaticMarkup(
        createElement(MarkdownMessage, { content: events[0].content }),
      );
      expect(html).toMatch(
        /<strong\b[^>]*>有名字、有长期记忆、能持续积累经历的 Agent 个体<\/strong>/,
      );
      expect(html).toContain("用户仍然觉得是在和同一个 Agent 合作。");
      expect(html).not.toContain("**");
      expect(normalizeHistoryMessages(messages)).toEqual(events);
      expect(messages).toEqual(original);
    },
  );

  it("accepts configuration controls without a business turn ID", () => {
    const request = configRequest("reasoning", 11);
    const update = configUpdate("config-update", 12);
    delete request.turn_id;
    delete update.turn_id;

    expect(
      textContents([
        segment("first", "持续积累", 10),
        request,
        update,
        segment("second", "经历", 13),
      ]),
    ).toEqual(["持续积累经历"]);
  });

  it.each([
    [12, 13],
    [11, 13],
  ])(
    "preserves an unknown sequence gap around a known configuration request (%i, %i)",
    (controlSeq, continuationSeq) => {
      expect(
        textContents([
          segment("first", "Before missing history", 10),
          configRequest("reasoning", controlSeq),
          segment("second", "After missing history", continuationSeq),
        ]),
      ).toEqual(["Before missing history", "After missing history"]);
    },
  );

  it("preserves a real tool boundary after a configuration request", () => {
    const events = normalizeHistoryMessages([
      segment("first", "Before tool", 10),
      configRequest("reasoning", 11),
      {
        message_id: "tool",
        session_id: "pax-session",
        turn_id: "turn-1",
        session_seq: 12,
        role: "assistant",
        message_type: "tool_call",
        tool: {
          tool_call_id: "tool-1",
          title: "Read project",
          status: "completed",
        },
      },
      segment("second", "After tool", 13),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "tool_call",
      "agent_message",
    ]);
    expect(
      events
        .filter((event) => event.type === "agent_message")
        .map((event) => event.content),
    ).toEqual(["Before tool", "After tool"]);
  });

  it.each<[string, Partial<HistoryMessage>]>([
    ["turn", { turn_id: "turn-2" }],
    ["session", { session_id: "other-session" }],
  ])(
    "does not bridge a configuration record from another %s",
    (_label, changes) => {
      expect(
        textContents([
          segment("first", "First", 10),
          { ...configRequest("reasoning", 11), ...changes },
          segment("second", "Second", 12),
        ]),
      ).toEqual(["First", "Second"]);
    },
  );

  it("preserves configuration records that also contain visible text", () => {
    const events = normalizeHistoryMessages([
      segment("first", "First", 10),
      {
        ...configRequest("reasoning", 11),
        parts: [{ part_index: 0, part_type: "text", text: "Visible message" }],
      },
      segment("second", "Second", 12),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "user_message",
      "agent_message",
    ]);
    expect(
      events.map((event) => ("content" in event ? event.content : undefined)),
    ).toEqual(["First", "Visible message", "Second"]);
  });

  it.each<[string, Partial<HistoryMessage>]>([
    ["turn", { turn_id: "turn-2" }],
    ["session", { session_id: "other-session" }],
    ["text type", { message_type: "message_delta" }],
    ["role", { role: "user" }],
  ])("preserves a change in %s", (_label, changes) => {
    expect(
      textContents([
        segment("first", "First", 10),
        configRequest("reasoning", 11),
        { ...segment("second", "Second", 12), ...changes },
      ]),
    ).toEqual(["First", "Second"]);
  });

  it("preserves thought boundaries between answer segments", () => {
    const events = normalizeHistoryMessages([
      segment("first", "First answer", 10),
      configRequest("reasoning", 11),
      {
        ...segment("thought", "Considering the change", 12),
        message_type: "agent_thought_chunk",
      },
      configRequest("fast", 13, "fast-mode", "true"),
      segment("second", "Second answer", 14),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "progress",
      "agent_message",
    ]);
    expect(
      events.map((event) => ("content" in event ? event.content : undefined)),
    ).toEqual(["First answer", "Considering the change", "Second answer"]);
  });

  it("does not treat an unknown non-displaying RPC as a configuration change", () => {
    const unknownRequest = configRequest("unknown", 11);
    unknownRequest.raw_json = {
      jsonrpc: "2.0",
      id: "unknown-request",
      method: "session/unknown_control",
      params: { sessionId: "native-session" },
    };

    expect(
      textContents([
        segment("first", "First", 10),
        unknownRequest,
        segment("second", "Second", 12),
      ]),
    ).toEqual(["First", "Second"]);
  });

  it.each(["first", "second", "reasoning"])(
    "preserves the selected history target %s",
    (targetMessageId) => {
      const events = normalizeHistoryMessages(
        [
          segment("first", "First", 10),
          configRequest("reasoning", 11),
          segment("second", "Second", 12),
        ],
        targetMessageId,
      );

      expect(
        events
          .filter((event) => event.type === "agent_message")
          .map((event) => event.content),
      ).toEqual(["First", "Second"]);
      if (targetMessageId !== "reasoning") {
        expect(
          events.filter((event) => event.historyMessageId === targetMessageId),
        ).toHaveLength(1);
      }
    },
  );
});

function segment(
  messageId: string,
  text: string,
  sessionSeq: number,
): HistoryMessage {
  return {
    message_id: messageId,
    session_id: "pax-session",
    turn_id: "turn-1",
    session_seq: sessionSeq,
    role: "assistant",
    created_at: "2026-11-04T22:55:00.000Z",
    message_type: "agent_message_chunk",
    // Ordinary canonical text rows retain the layout marker, not native IDs.
    raw_json: { text_layout: "segment" },
    parts: [{ part_index: 0, part_type: "text", text }],
  };
}

function configRequest(
  messageId: string,
  sessionSeq: number,
  configId = "reasoning_effort",
  value = "ultra",
): HistoryMessage {
  return {
    message_id: messageId,
    session_id: "pax-session",
    turn_id: "turn-1",
    session_seq: sessionSeq,
    role: "user",
    created_at: "2026-11-04T22:55:00.000Z",
    message_type: "acp_request",
    raw_json: {
      jsonrpc: "2.0",
      id: `request-${messageId}`,
      method: "session/set_config_option",
      params: { sessionId: "native-session", configId, value },
    },
  };
}

function configUpdate(messageId: string, sessionSeq: number): HistoryMessage {
  return {
    message_id: messageId,
    session_id: "pax-session",
    turn_id: "turn-1",
    session_seq: sessionSeq,
    role: "assistant",
    created_at: "2026-11-04T22:55:00.000Z",
    message_type: "config_option_update",
    raw_json: {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "native-session",
        update: {
          sessionUpdate: "config_option_update",
          configOptions: [
            {
              id: "reasoning_effort",
              name: "Reasoning effort",
              type: "select",
              currentValue: "ultra",
              options: [{ value: "ultra", name: "Ultra" }],
            },
          ],
        },
      },
    },
  };
}

function textContents(messages: HistoryMessage[]) {
  return normalizeHistoryMessages(messages)
    .filter(
      (event) =>
        event.type === "agent_message" ||
        event.type === "user_message" ||
        event.type === "progress",
    )
    .map((event) => event.content);
}
