import { MarkdownMessage } from "@/components/ui/markdown-message";
import type { HistoryMessage } from "@/features/api/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeHistoryMessages } from "./normalize-history-message";

describe("history text continuation across passive subagent completion", () => {
  it.each(["compact", "detail"] as const)(
    "joins canonical text around a %s completion and keeps its inspection event",
    (format) => {
      const notice = completion("completion", 11, format);
      const messages = [
        segment("first", "这部分适合放在 paxd", 10),
        notice,
        segment("second", "/paxl 的本机适配层。", 12),
      ];
      const original = structuredClone(messages);

      const events = normalizeHistoryMessages(messages);

      expect(events.map((event) => event.type)).toEqual([
        "agent_message",
        "tool_call",
      ]);
      expect(events[0]).toMatchObject({
        type: "agent_message",
        content: "这部分适合放在 paxd/paxl 的本机适配层。",
        historyTextLayout: "segment",
        streaming: false,
      });
      expect(events[1]).toMatchObject({
        type: "tool_call",
        toolCallId: "subagent-completed-event-id",
        status: "done",
      });
      if (format === "compact") {
        expect(events[1]).toMatchObject({
          historyDetails: [{ messageId: "completion" }],
        });
      }
      expect(normalizeHistoryMessages(messages)).toEqual(events);
      expect(messages).toEqual(original);
    },
  );

  it("renders Markdown emphasis that spans the completion notice", () => {
    const events = normalizeHistoryMessages([
      segment("first", "这里适合放在 **paxd", 10),
      completion("completion", 11),
      segment("second", "/paxl 的本机适配层**，前端负责展示。", 12),
    ]);
    const text = events.filter((event) => event.type === "agent_message");

    expect(text).toHaveLength(1);
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, { content: text[0].content }),
    );
    expect(html).toMatch(/<strong\b[^>]*>paxd\/paxl 的本机适配层<\/strong>/);
    expect(html).not.toContain("**");
  });

  it("keeps punctuation-ending strong emphasis when a completion no longer separates the text", () => {
    const events = normalizeHistoryMessages([
      segment("first", "这是**说明：**", 10),
      completion("completion", 11),
      segment("second", "后文", 12),
    ]);
    const text = events.filter((event) => event.type === "agent_message");

    expect(text).toHaveLength(1);
    expect(text[0].content).toBe("这是**说明：**后文");
    const html = renderToStaticMarkup(
      createElement(MarkdownMessage, { content: text[0].content }),
    );
    expect(html).toMatch(/<strong\b[^>]*>说明：<\/strong>后文/);
    expect(html).not.toContain("**");
  });

  it("keeps multiple completion notices inspectable after the uninterrupted answer", () => {
    const events = normalizeHistoryMessages([
      segment("first", "现有 ", 10),
      completion("first-completion", 11),
      segment("middle", "Agent ", 12),
      completion("second-completion", 13),
      segment("last", "配置", 14),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "tool_call",
      "tool_call",
    ]);
    expect(textContents(events)).toEqual(["现有 Agent 配置"]);
    expect(events.slice(1).map((event) => event.id)).toEqual([
      "first-completion",
      "second-completion",
    ]);
  });

  it("continues through a configuration change next to the completion", () => {
    const events = normalizeHistoryMessages([
      segment("first", "本机", 10),
      completion("completion", 11),
      {
        message_id: "config",
        session_id: "pax-session",
        session_seq: 12,
        role: "user",
        message_type: "acp_request",
        raw_json: {
          jsonrpc: "2.0",
          id: "config-request",
          method: "session/set_config_option",
          params: { configId: "reasoning_effort", value: "ultra" },
        },
      },
      segment("second", "适配层", 13),
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "tool_call",
    ]);
    expect(textContents(events)).toEqual(["本机适配层"]);
  });

  it.each([
    [12, 13],
    [11, 13],
  ])(
    "preserves unknown sequence gaps around completion (%i, %i)",
    (noticeSeq, continuationSeq) => {
      const events = normalizeHistoryMessages([
        segment("first", "Before missing history", 10),
        completion("completion", noticeSeq),
        segment("second", "After missing history", continuationSeq),
      ]);

      expect(textContents(events)).toEqual([
        "Before missing history",
        "After missing history",
      ]);
      expect(events.map((event) => event.type)).toEqual([
        "agent_message",
        "tool_call",
        "agent_message",
      ]);
    },
  );

  it("preserves a real tool boundary after the completion notice", () => {
    const events = normalizeHistoryMessages([
      segment("first", "Before tool", 10),
      completion("completion", 11),
      {
        ...completion("read-file", 12),
        tool: {
          tool_call_id: "read-file-id",
          title: "Read project",
          status: "completed",
          kind: "read",
        },
      },
      segment("second", "After tool", 13),
    ]);

    expect(textContents(events)).toEqual(["Before tool", "After tool"]);
    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "tool_call",
      "tool_call",
      "agent_message",
    ]);
  });

  it.each<[string, Partial<HistoryMessage>]>([
    ["turn", { turn_id: "turn-2" }],
    ["session", { session_id: "other-session" }],
  ])("does not bridge a completion from another %s", (_name, changes) => {
    const events = normalizeHistoryMessages([
      segment("first", "First", 10),
      { ...completion("completion", 11), ...changes },
      segment("second", "Second", 12),
    ]);

    expect(textContents(events)).toEqual(["First", "Second"]);
    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "tool_call",
      "agent_message",
    ]);
  });

  it.each(["first", "second", "completion"])(
    "keeps the selected history target %s at its original boundary",
    (targetMessageId) => {
      const events = normalizeHistoryMessages(
        [
          segment("first", "First", 10),
          completion("completion", 11),
          segment("second", "Second", 12),
        ],
        targetMessageId,
      );

      expect(textContents(events)).toEqual(["First", "Second"]);
      expect(events.map((event) => event.type)).toEqual([
        "agent_message",
        "tool_call",
        "agent_message",
      ]);
      expect(
        events.filter((event) => event.historyMessageId === targetMessageId),
      ).toHaveLength(1);
    },
  );

  it("keeps subagent starts and interactions as active tool boundaries", () => {
    for (const activityKind of ["started", "interacted"] as const) {
      const notice = completion("activity", 11, "detail");
      notice.raw_json = {
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId: "native-session",
          update: {
            sessionUpdate: "tool_call",
            toolCallId: `subagent-${activityKind}-event-id`,
            title: `${activityKind === "started" ? "Start" : "Interact with"} subagent agent_capability_discovery`,
            kind: "other",
            status: "completed",
            rawInput: {
              activityKind,
              agentThreadId: "child",
              agentPath: "/root/agent_capability_discovery",
            },
          },
        },
      };

      const events = normalizeHistoryMessages([
        segment("first", "First", 10),
        notice,
        segment("second", "Second", 12),
      ]);
      expect(textContents(events)).toEqual(["First", "Second"]);
      expect(events.map((event) => event.type)).toEqual([
        "agent_message",
        "tool_call",
        "agent_message",
      ]);
    }
  });

  it("does not classify an ordinary tool by a completion-like title alone", () => {
    const notice = completion("ordinary-tool", 11);
    notice.tool!.tool_call_id = "ordinary-tool-id";

    const events = normalizeHistoryMessages([
      segment("first", "First", 10),
      notice,
      segment("second", "Second", 12),
    ]);

    expect(textContents(events)).toEqual(["First", "Second"]);
    expect(events.map((event) => event.type)).toEqual([
      "agent_message",
      "tool_call",
      "agent_message",
    ]);
  });
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
    created_at: "2026-11-04T23:19:00.000Z",
    message_type: "agent_message_chunk",
    // Canonical rows keep the segment marker without native message IDs.
    raw_json: { text_layout: "segment" },
    parts: [{ part_index: 0, part_type: "text", text }],
  };
}

function completion(
  messageId: string,
  sessionSeq: number,
  format: "compact" | "detail" = "compact",
): HistoryMessage {
  const message: HistoryMessage = {
    message_id: messageId,
    session_id: "pax-session",
    turn_id: "turn-1",
    session_seq: sessionSeq,
    role: "assistant",
    created_at: "2026-11-04T23:19:00.000Z",
    message_type: "tool_call",
  };
  if (format === "compact") {
    return {
      ...message,
      has_detail: true,
      tool: {
        tool_call_id: "subagent-completed-event-id",
        title: "Complete subagent agent_capability_discovery",
        status: "completed",
        kind: "other",
      },
    };
  }
  return {
    ...message,
    raw_json: {
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "native-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "subagent-completed-event-id",
          title: "Complete subagent agent_capability_discovery",
          status: "completed",
          kind: "other",
          rawInput: {
            activityKind: "completed",
            agentThreadId: "child",
            agentPath: "/root/agent_capability_discovery",
          },
        },
      },
    },
  };
}

function textContents(events: ReturnType<typeof normalizeHistoryMessages>) {
  return events
    .filter((event) => event.type === "agent_message")
    .map((event) => event.content);
}
