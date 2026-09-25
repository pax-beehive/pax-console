import { describe, expect, it } from "vitest";
import { normalizeHistoryMessages } from "./normalize-history-message";
import { mergeEvents } from "./merge-session-events";
import {
  groupWorkstreamEvents,
  isVisibleTimelineEvent,
  SessionEvent,
} from "./session-events";

describe("isVisibleTimelineEvent", () => {
  it("hides completion, run status, token usage, and context usage control events", () => {
    const events: SessionEvent[] = [
      {
        type: "user_message",
        id: "user-1",
        sessionId: "sess_1",
        content: "hello",
        createdAt: "2026-06-26T12:00:00Z",
      },
      {
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "running",
        createdAt: "2026-06-26T12:00:01Z",
      },
      {
        type: "token_usage",
        id: "usage-1",
        sessionId: "sess_1",
        totalTokens: 12,
        createdAt: "2026-06-26T12:00:02Z",
      },
      {
        type: "context_usage",
        id: "context-1",
        sessionId: "sess_1",
        usedTokens: 12,
        windowTokens: 100,
        createdAt: "2026-06-26T12:00:02Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-06-26T12:00:02Z",
      },
      {
        type: "artifact_publication",
        id: "artifact-1",
        sessionId: "sess_1",
        publicationId: "apub_1",
        contentRef: "main",
        createdAt: "2026-06-26T12:00:02.500Z",
      },
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "hi",
        createdAt: "2026-06-26T12:00:03Z",
      },
    ];

    expect(
      events.filter(isVisibleTimelineEvent).map((event) => event.type),
    ).toEqual(["user_message", "artifact_publication", "agent_message"]);
  });
});

describe("groupWorkstreamEvents", () => {
  it("closes a Working group when the business turn changes", () => {
    const progress = (id: string, turnId: string): SessionEvent => ({
      type: "progress",
      id,
      sessionId: "sess_1",
      turnId,
      content: id,
      streaming: true,
      sessionUpdate: "agent_thought_chunk",
      createdAt: "2026-07-04T10:00:00.000Z",
    });

    const grouped = groupWorkstreamEvents([
      progress("turn_1:a", "turn_1"),
      progress("turn_1:b", "turn_1"),
      progress("turn_2:a", "turn_2"),
      progress("turn_2:b", "turn_2"),
    ]);

    expect(grouped).toMatchObject([
      { type: "work_group", complete: true },
      { type: "work_group", complete: false },
    ]);
  });

  it("places a turn footer only when that turn's done frame arrives", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        turnId: "turn_1",
        content: "Partial answer before more work.",
        createdAt: "2026-07-04T10:00:00.000Z",
      },
      {
        type: "progress",
        id: "turn-2-progress-a",
        sessionId: "sess_1",
        turnId: "turn_2",
        content: "Continuing to work",
        streaming: true,
        createdAt: "2026-07-04T10:00:01.000Z",
      },
      {
        type: "progress",
        id: "turn-2-progress-b",
        sessionId: "sess_1",
        turnId: "turn_2",
        content: "Checking the result",
        streaming: true,
        createdAt: "2026-07-04T10:00:02.000Z",
      },
    ];

    expect(groupWorkstreamEvents(events).map((item) => item.type)).toEqual([
      "event",
      "work_group",
    ]);

    const groupedAfterDone = groupWorkstreamEvents([
      ...events,
      {
        type: "turn_done",
        id: "turn-1-done",
        sessionId: "sess_1",
        turnId: "turn_1",
        createdAt: "2026-07-04T10:00:03.000Z",
      },
    ]);

    expect(groupedAfterDone).toMatchObject([
      { type: "event", id: "agent-1" },
      { type: "work_group", complete: false },
      {
        type: "turn_footer",
        id: "turn_footer:agent-1",
        turnId: "turn_1",
      },
    ]);
  });

  it("attaches final usage and compact context metadata to the turn footer", () => {
    const turn = { sessionId: "sess_1", turnId: "turn_1" };
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        ...turn,
        content: "Finished.",
        createdAt: "2026-09-08T04:26:00.000Z",
      },
      {
        type: "context_usage",
        id: "context-before",
        ...turn,
        usedTokens: 221_801,
        windowTokens: 258_400,
        createdAt: "2026-09-08T04:26:16.838Z",
      },
      {
        type: "tool_call",
        id: "compact-1",
        ...turn,
        name: "Context compacted",
        status: "done",
        contextCompaction: true,
        createdAt: "2026-09-08T04:26:16.850Z",
      },
      {
        type: "context_usage",
        id: "context-after",
        ...turn,
        usedTokens: 10_307,
        windowTokens: 258_400,
        createdAt: "2026-09-08T04:26:30.868Z",
      },
      {
        type: "context_usage",
        id: "context-final",
        ...turn,
        usedTokens: 16_372,
        windowTokens: 258_400,
        createdAt: "2026-09-08T04:26:36.787Z",
      },
      {
        type: "token_usage",
        id: "tokens-final",
        ...turn,
        inputTokens: 5_056,
        cacheReadTokens: 11_264,
        outputTokens: 52,
        reasoningTokens: 0,
        totalTokens: 16_372,
        createdAt: "2026-09-08T04:26:36.789Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        ...turn,
        createdAt: "2026-09-08T04:26:36.790Z",
      },
    ];

    expect(groupWorkstreamEvents(events).at(-1)).toMatchObject({
      type: "turn_footer",
      tokenUsage: {
        inputTokens: 5_056,
        cacheReadTokens: 11_264,
        outputTokens: 52,
        totalTokens: 16_372,
      },
      contextUsage: {
        usedTokens: 16_372,
        windowTokens: 258_400,
      },
      contextCompaction: {
        beforeTokens: 221_801,
        afterTokens: 10_307,
        windowTokens: 258_400,
      },
    });
  });

  it.each([
    {
      event: {
        type: "progress" as const,
        id: "thought-1",
        sessionId: "sess_1",
        content: "Inspecting the repository.",
        createdAt: "2026-06-26T12:00:00Z",
      },
    },
    {
      event: {
        type: "tool_call" as const,
        id: "tool-1",
        sessionId: "sess_1",
        name: "Read",
        status: "done" as const,
        createdAt: "2026-06-26T12:00:00Z",
      },
    },
  ])(
    "keeps a single $event.type in the same collapsed activity structure",
    ({ event }) => {
      expect(groupWorkstreamEvents([event])).toMatchObject([
        {
          type: "work_group",
          id: `work_group:${event.id}`,
          complete: false,
          events: [{ id: event.id, type: event.type }],
        },
      ]);
    },
  );

  it("groups a run as soon as it contains two work events", () => {
    const events: SessionEvent[] = [
      {
        type: "progress",
        id: "thought-1",
        sessionId: "sess_1",
        content: "Inspecting the repository.",
        createdAt: "2026-06-26T12:00:00Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "Read",
        status: "running",
        createdAt: "2026-06-26T12:00:01Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-06-26T12:00:02Z",
      },
    ];

    expect(groupWorkstreamEvents(events)).toMatchObject([
      {
        type: "work_group",
        id: "work_group:thought-1",
        complete: true,
        completedAt: "2026-06-26T12:00:02Z",
        events: [{ id: "thought-1" }, { id: "tool-1" }],
      },
    ]);
  });

  it("groups interleaved thoughts and tool calls into one work block", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will inspect files.",
        createdAt: "2026-06-26T12:00:00Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "Read",
        status: "running",
        createdAt: "2026-06-26T12:00:01Z",
      },
      {
        type: "tool_call",
        id: "tool-2",
        sessionId: "sess_1",
        name: "Grep",
        status: "done",
        createdAt: "2026-06-26T12:00:02Z",
      },
      {
        type: "progress",
        id: "thought-1",
        sessionId: "sess_1",
        content: "Found the relevant file.",
        createdAt: "2026-06-26T12:00:03Z",
      },
      {
        type: "tool_call",
        id: "tool-3",
        sessionId: "sess_1",
        name: "Edit",
        status: "queued",
        createdAt: "2026-06-26T12:00:04Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      {
        type: "event",
        id: "agent-1",
      },
      {
        type: "work_group",
        id: "work_group:tool-1",
        events: [
          { id: "tool-1", name: "Read", status: "running" },
          { id: "tool-2", name: "Grep", status: "done" },
          { id: "thought-1", type: "progress" },
          { id: "tool-3", name: "Edit", status: "queued" },
        ],
      },
    ]);
  });

  it("keeps a legacy thought chunk inside the active turn's work block", () => {
    const events: SessionEvent[] = [
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        turnId: "turn_1",
        name: "Read",
        status: "running",
        createdAt: "2026-06-26T12:00:01Z",
      },
      {
        type: "progress",
        id: "thought-legacy",
        sessionId: "sess_1",
        content: "Checking the result.",
        streaming: true,
        sessionUpdate: "agent_thought_chunk",
        createdAt: "2026-06-26T12:00:02Z",
      },
      {
        type: "tool_call",
        id: "tool-2",
        sessionId: "sess_1",
        turnId: "turn_1",
        name: "Edit",
        status: "queued",
        createdAt: "2026-06-26T12:00:03Z",
      },
    ];

    expect(groupWorkstreamEvents(events)).toMatchObject([
      {
        type: "work_group",
        id: "work_group:tool-1",
        events: [
          { id: "tool-1", turnId: "turn_1" },
          { id: "thought-legacy", type: "progress" },
          { id: "tool-2", turnId: "turn_1" },
        ],
      },
    ]);
  });

  it("does not render a turn footer while the current turn is still running", () => {
    const events: SessionEvent[] = [
      {
        type: "user_message",
        id: "user-1",
        sessionId: "sess_1",
        content: "update weather",
        createdAt: "2026-07-09T04:29:00Z",
      },
      {
        type: "progress",
        id: "thought-1",
        sessionId: "sess_1",
        content: "thinking",
        streaming: true,
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will make a small edit.",
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "write",
        status: "done",
        patches: [
          {
            operation: "write",
            path: "/tmp/weather.sh",
            newText: "echo weather\n",
            source: "input",
          },
        ],
        createdAt: "2026-07-09T04:29:03Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped.map((item) => item.type)).toEqual([
      "event",
      "work_group",
      "event",
      "work_group",
    ]);
  });

  it("does not infer a footer when history has no explicit done frame", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I wrote the file.",
        createdAt: "2026-07-09T17:08:38Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "Writing to ../private/tmp/weather.py",
        status: "done",
        toolCallId: "write_file__ujao7t88",
        patches: [
          {
            operation: "write",
            path: "/private/tmp/weather.py",
            newText: "print('weather')\n",
            source: "output",
          },
        ],
        createdAt: "2026-07-09T17:08:39Z",
      },
      {
        type: "permission_request",
        id: "permission-1",
        sessionId: "sess_1",
        requestId: "3",
        title: "python3 /private/tmp/weather.py London",
        toolCallId: "run_shell_command__abc",
        toolKind: "execute",
        options: [],
        createdAt: "2026-07-09T17:08:40Z",
      },
    ];

    expect(groupWorkstreamEvents(events).at(-1)).toMatchObject({
      type: "event",
      id: "permission-1",
    });
    expect(
      groupWorkstreamEvents(events).some((item) => item.type === "turn_footer"),
    ).toBe(false);
  });

  it("does not infer a footer when the next user message arrives", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "First response",
        createdAt: "2026-07-09T17:08:38Z",
      },
      {
        type: "user_message",
        id: "user-2",
        sessionId: "sess_1",
        content: "Follow-up",
        createdAt: "2026-07-09T17:09:38Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped.map((item) => item.type)).toEqual(["event", "event"]);
  });

  it("marks only the last agent message in a turn for action controls", () => {
    const events: SessionEvent[] = [
      {
        type: "user_message",
        id: "user-1",
        sessionId: "sess_1",
        content: "fix the image",
        createdAt: "2026-07-09T04:29:00Z",
      },
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will inspect the image.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "view_image",
        status: "done",
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "agent_message",
        id: "agent-2",
        sessionId: "sess_1",
        content: "I updated the image.",
        createdAt: "2026-07-09T04:29:03Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:04Z",
      },
      {
        type: "user_message",
        id: "user-2",
        sessionId: "sess_1",
        content: "the arrow is still off",
        createdAt: "2026-07-09T04:30:00Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      { type: "event", id: "user-1" },
      { type: "event", id: "agent-1" },
      {
        type: "work_group",
        id: "work_group:tool-1",
        events: [{ id: "tool-1" }],
      },
      { type: "event", id: "agent-2" },
      {
        type: "turn_footer",
        id: "turn_footer:agent-2",
        actionsContent: "I updated the image.",
      },
      { type: "event", id: "user-2" },
    ]);
  });

  it("attaches code patches from a turn to the final agent message", () => {
    const events: SessionEvent[] = [
      {
        type: "user_message",
        id: "user-1",
        sessionId: "sess_1",
        content: "change the file",
        createdAt: "2026-07-09T04:29:00Z",
      },
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will edit it.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "patch",
        status: "done",
        patches: [
          {
            operation: "patch",
            path: "/tmp/weather.py",
            oldText: "old\n",
            newText: "new\n",
            source: "input",
          },
        ],
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "agent_message",
        id: "agent-2",
        sessionId: "sess_1",
        content: "Done.",
        createdAt: "2026-07-09T04:29:03Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:04Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      { type: "event", id: "user-1" },
      { type: "event", id: "agent-1" },
      {
        type: "work_group",
        id: "work_group:tool-1",
        events: [{ id: "tool-1" }],
      },
      { type: "event", id: "agent-2" },
      {
        type: "turn_footer",
        id: "turn_footer:agent-2",
        actionsContent: "Done.",
        turnPatches: [
          {
            operation: "patch",
            path: "/tmp/weather.py",
            source: "input",
          },
        ],
      },
    ]);
  });

  it("keeps file patch footers scoped to their own completed turns", () => {
    const events: SessionEvent[] = [
      {
        type: "user_message",
        id: "user-1",
        sessionId: "sess_1",
        content: "first change",
        createdAt: "2026-07-09T04:29:00Z",
      },
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "First done.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "patch",
        status: "done",
        patches: [
          {
            operation: "patch",
            path: "/tmp/first.py",
            oldText: "old\n",
            newText: "new\n",
            source: "input",
          },
        ],
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:03Z",
      },
      {
        type: "user_message",
        id: "user-2",
        sessionId: "sess_1",
        content: "second change",
        createdAt: "2026-07-09T04:30:00Z",
      },
      {
        type: "agent_message",
        id: "agent-2",
        sessionId: "sess_1",
        content: "Second done.",
        createdAt: "2026-07-09T04:30:01Z",
      },
      {
        type: "tool_call",
        id: "tool-2",
        sessionId: "sess_1",
        name: "patch",
        status: "done",
        patches: [
          {
            operation: "patch",
            path: "/tmp/second.py",
            oldText: "old\n",
            newText: "new\n",
            source: "input",
          },
        ],
        createdAt: "2026-07-09T04:30:02Z",
      },
      {
        type: "turn_done",
        id: "done-2",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:30:03Z",
      },
    ];

    const footers = groupWorkstreamEvents(events).filter(
      (item) => item.type === "turn_footer",
    );

    expect(footers).toMatchObject([
      {
        type: "turn_footer",
        id: "turn_footer:agent-1",
        turnPatches: [{ path: "/tmp/first.py" }],
      },
      {
        type: "turn_footer",
        id: "turn_footer:agent-2",
        turnPatches: [{ path: "/tmp/second.py" }],
      },
    ]);
  });

  it("includes delete patches from rm commands in the turn footer", () => {
    const events: SessionEvent[] = [
      {
        type: "user_message",
        id: "user-1",
        sessionId: "sess_1",
        content: "delete weather",
        createdAt: "2026-07-09T04:29:00Z",
      },
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "Removed it.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-rm",
        sessionId: "sess_1",
        name: "terminal: rm ~/weather.py",
        status: "done",
        patches: [
          {
            operation: "delete",
            path: "~/weather.py",
            source: "input",
          },
        ],
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:03Z",
      },
    ];

    expect(groupWorkstreamEvents(events).at(-1)).toMatchObject({
      type: "turn_footer",
      id: "turn_footer:agent-1",
      turnPatches: [
        {
          operation: "delete",
          path: "~/weather.py",
        },
      ],
    });
  });

  it("keeps multiple applied patches for the same file within one turn footer", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "Wrote and removed the file.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-write",
        sessionId: "sess_1",
        name: "Writing to ../private/tmp/weather.py",
        status: "done",
        patches: [
          {
            operation: "write",
            path: "/private/tmp/weather.py",
            newText: "print('weather')\n",
            source: "output",
          },
        ],
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "tool_call",
        id: "tool-delete",
        sessionId: "sess_1",
        name: "terminal: rm /private/tmp/weather.py",
        status: "done",
        patches: [
          {
            operation: "delete",
            path: "/private/tmp/weather.py",
            source: "input",
          },
        ],
        createdAt: "2026-07-09T04:29:03Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:04Z",
      },
    ];

    expect(groupWorkstreamEvents(events).at(-1)).toMatchObject({
      type: "turn_footer",
      turnPatches: [
        {
          operation: "write",
          path: "/private/tmp/weather.py",
        },
        {
          operation: "delete",
          path: "/private/tmp/weather.py",
        },
      ],
    });
  });

  it("keeps Gemini history tool update edits when a later rm deletes the same file", () => {
    const events = mergeEvents(
      normalizeHistoryMessages([
        {
          id: 31603,
          message_id: "msg_gemini_edit_update",
          session_id: "sess_1",
          message_type: "tool_call_update",
          role: "assistant",
          created_at: "2026-07-09T17:08:39.926239-07:00",
          raw_json: {
            method: "session/update",
            params: {
              sessionId: "sess_1",
              update: {
                content: [
                  {
                    _meta: { kind: "add" },
                    newText: "#!/usr/bin/env python3\nprint('weather')\n",
                    oldText: "",
                    path: "/private/tmp/weather.py",
                    type: "diff",
                  },
                ],
                kind: "edit",
                locations: [{ path: "/private/tmp/weather.py" }],
                sessionUpdate: "tool_call_update",
                status: "completed",
                title: "Writing to ../private/tmp/weather.py",
                toolCallId: "write_file__ujao7t88",
              },
            },
            jsonrpc: "2.0",
          },
          parts: [
            {
              part_index: 0,
              part_type: "raw_json",
              payload_json: {
                method: "session/update",
                params: {
                  sessionId: "sess_1",
                  update: {
                    content: [
                      {
                        _meta: { kind: "add" },
                        newText: "#!/usr/bin/env python3\nprint('weather')\n",
                        oldText: "",
                        path: "/private/tmp/weather.py",
                        type: "diff",
                      },
                    ],
                    kind: "edit",
                    sessionUpdate: "tool_call_update",
                    status: "completed",
                    title: "Writing to ../private/tmp/weather.py",
                    toolCallId: "write_file__ujao7t88",
                  },
                },
                jsonrpc: "2.0",
              },
            },
          ],
        },
        {
          message_id: "msg_rm_update",
          session_id: "sess_1",
          message_type: "tool_call_update",
          role: "assistant",
          created_at: "2026-07-09T17:09:00.000000-07:00",
          raw_json: {
            method: "session/update",
            params: {
              sessionId: "sess_1",
              update: {
                content: [
                  {
                    content: {
                      text: "$ rm /private/tmp/weather.py",
                      type: "text",
                    },
                    type: "content",
                  },
                ],
                kind: "execute",
                sessionUpdate: "tool_call",
                status: "completed",
                title: "terminal: rm /private/tmp/weather.py",
                toolCallId: "rm_weather",
              },
            },
            jsonrpc: "2.0",
          },
        },
      ]),
    );

    events.push({
      type: "turn_done",
      id: "done-1",
      sessionId: "sess_1",
      createdAt: "2026-07-09T17:09:01.000000-07:00",
    });

    expect(groupWorkstreamEvents(events).at(-1)).toMatchObject({
      type: "turn_footer",
      turnPatches: [
        {
          operation: "write",
          path: "/private/tmp/weather.py",
          source: "output",
        },
        {
          operation: "delete",
          path: "/private/tmp/weather.py",
        },
      ],
    });
  });

  it("attaches proposed permission patches to the turn footer at turn end", () => {
    const proposedPatch = {
      operation: "write" as const,
      path: "/tmp/weather.sh",
      newText: "#!/bin/bash\necho weather\n",
      source: "permission" as const,
    };
    const baseEvents: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will write the file.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "write",
        status: "running",
        permissions: [
          {
            type: "permission_request",
            id: "permission-1",
            sessionId: "sess_1",
            requestId: "permission-1",
            title: "Approve edit: /tmp/weather.sh",
            rawInput: {
              arguments: {
                content: "#!/bin/bash\necho weather\n",
                path: "/tmp/weather.sh",
              },
              tool: "write_file",
            },
            patches: [proposedPatch],
            options: [],
            createdAt: "2026-07-09T04:29:02Z",
          },
        ],
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "agent_message",
        id: "agent-2",
        sessionId: "sess_1",
        content: "Done.",
        createdAt: "2026-07-09T04:29:03Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:04Z",
      },
    ];

    const grouped = groupWorkstreamEvents(baseEvents);

    expect(grouped[2]).toMatchObject({
      type: "event",
      id: "agent-2",
    });
    expect(grouped[3]).toMatchObject({
      type: "turn_footer",
      id: "turn_footer:agent-2",
      actionsContent: "Done.",
      turnPatches: [
        {
          operation: "write",
          path: "/tmp/weather.sh",
          source: "permission",
        },
      ],
    });
  });

  it("prefers applied tool update patches over proposed permission patches in the footer", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will write the file.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "permission_request",
        id: "permission-1",
        sessionId: "sess_1",
        requestId: "2",
        title: "Writing to ../private/tmp/weather.py",
        patches: [
          {
            operation: "write",
            path: "/private/tmp/weather.py",
            newText: "proposed\n",
            source: "permission",
          },
        ],
        options: [],
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "Writing to ../private/tmp/weather.py",
        status: "done",
        toolCallId: "write_file__ujao7t88",
        patches: [
          {
            operation: "write",
            path: "/private/tmp/weather.py",
            newText: "applied\n",
            source: "output",
          },
        ],
        createdAt: "2026-07-09T04:29:03Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:04Z",
      },
    ];

    expect(groupWorkstreamEvents(events).at(-1)).toMatchObject({
      type: "turn_footer",
      id: "turn_footer:agent-1",
      turnPatches: [
        {
          operation: "write",
          path: "/private/tmp/weather.py",
          newText: "applied\n",
          source: "output",
        },
      ],
    });
  });

  it("renders an applied patch footer after tools even without a trailing agent message", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will write the file.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "write",
        output: "wrote /tmp/weather.sh",
        status: "done",
        permissions: [
          {
            type: "permission_request",
            id: "permission-1",
            sessionId: "sess_1",
            requestId: "permission-1",
            title: "Approve edit: /tmp/weather.sh",
            rawInput: {
              arguments: {
                content: "#!/bin/bash\necho weather\n",
                path: "/tmp/weather.sh",
              },
              tool: "write_file",
            },
            patches: [
              {
                operation: "write",
                path: "/tmp/weather.sh",
                newText: "#!/bin/bash\necho weather\n",
                source: "permission",
              },
            ],
            options: [],
            createdAt: "2026-07-09T04:29:02Z",
          },
        ],
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:03Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      { type: "event", id: "agent-1" },
      {
        type: "work_group",
        id: "work_group:tool-1",
        events: [{ id: "tool-1" }],
      },
      {
        type: "turn_footer",
        id: "turn_footer:agent-1",
        actionsContent: "I will write the file.",
        turnPatches: [
          {
            operation: "write",
            path: "/tmp/weather.sh",
            source: "permission",
          },
        ],
      },
    ]);
  });

  it("promotes standalone Hermes permission patches when a later tool update only says wrote", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "I will write the file.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "write",
        status: "called",
        createdAt: "2026-07-09T04:29:02Z",
      },
      {
        type: "permission_request",
        id: "permission-1",
        sessionId: "sess_1",
        requestId: "permission-1",
        title: "Approve edit: /tmp/weather.sh",
        rawInput: {
          arguments: {
            content: "#!/bin/bash\necho weather\n",
            path: "/tmp/weather.sh",
          },
          tool: "write_file",
        },
        options: [],
        createdAt: "2026-07-09T04:29:03Z",
      },
      {
        type: "tool_call",
        id: "tool-1",
        sessionId: "sess_1",
        name: "write",
        output: "wrote",
        status: "called",
        createdAt: "2026-07-09T04:29:04Z",
      },
      {
        type: "turn_done",
        id: "done-1",
        sessionId: "sess_1",
        createdAt: "2026-07-09T04:29:05Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped.at(-1)).toMatchObject({
      type: "turn_footer",
      id: "turn_footer:agent-1",
      turnPatches: [
        {
          operation: "write",
          path: "/tmp/weather.sh",
          source: "permission",
        },
      ],
    });
  });

  it("does not treat a generic done run status as an explicit done frame", () => {
    const events: SessionEvent[] = [
      {
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "Done.",
        createdAt: "2026-07-09T04:29:01Z",
      },
      {
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
        createdAt: "2026-07-09T04:29:02Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([{ type: "event", id: "agent-1" }]);
    expect(grouped.some((item) => item.type === "turn_footer")).toBe(false);
  });
});
