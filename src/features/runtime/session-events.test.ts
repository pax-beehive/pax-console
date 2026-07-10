import { describe, expect, it } from "vitest";
import { normalizeHistoryMessages } from "./normalize-history-message";
import { mergeEvents } from "./merge-session-events";
import {
  groupWorkstreamEvents,
  isVisibleTimelineEvent,
  SessionEvent,
} from "./session-events";

describe("isVisibleTimelineEvent", () => {
  it("hides run status and token usage control events from the workstream", () => {
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
        type: "agent_message",
        id: "agent-1",
        sessionId: "sess_1",
        content: "hi",
        createdAt: "2026-06-26T12:00:03Z",
      },
    ];

    expect(
      events.filter(isVisibleTimelineEvent).map((event) => event.type),
    ).toEqual(["user_message", "agent_message"]);
  });
});

describe("groupWorkstreamEvents", () => {
  it("groups adjacent tool call events and ends the group at the next visible event", () => {
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
        type: "tool_group",
        id: "tool_group:tool-1",
        events: [
          { id: "tool-1", name: "Read", status: "running" },
          { id: "tool-2", name: "Grep", status: "done" },
        ],
      },
      {
        type: "event",
        id: "thought-1",
      },
      {
        type: "tool_group",
        id: "tool_group:tool-3",
        events: [{ id: "tool-3", name: "Edit", status: "queued" }],
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
      "event",
      "event",
      "tool_group",
    ]);
  });

  it("can flush the final completed history turn when no run status event exists", () => {
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
    expect(groupWorkstreamEvents(events, { flushFinalTurn: true }).at(-1))
      .toMatchObject({
        type: "turn_footer",
        id: "turn_footer:agent-1",
        turnPatches: [
          {
            operation: "write",
            path: "/private/tmp/weather.py",
            source: "output",
          },
        ],
      });
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
      { type: "tool_group", id: "tool_group:tool-1" },
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
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
        createdAt: "2026-07-09T04:29:04Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      { type: "event", id: "user-1" },
      { type: "event", id: "agent-1" },
      { type: "tool_group", id: "tool_group:tool-1" },
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
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
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
        type: "run_status",
        id: "status-2",
        sessionId: "sess_1",
        status: "done",
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
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
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
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
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

    expect(groupWorkstreamEvents(events, { flushFinalTurn: true }).at(-1))
      .toMatchObject({
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
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
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
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
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
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
        createdAt: "2026-07-09T04:29:03Z",
      },
    ];

    const grouped = groupWorkstreamEvents(events);

    expect(grouped).toMatchObject([
      { type: "event", id: "agent-1" },
      { type: "tool_group", id: "tool_group:tool-1" },
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
        type: "run_status",
        id: "status-1",
        sessionId: "sess_1",
        status: "done",
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

  it("marks an agent message when a done run status ends the turn", () => {
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

    expect(grouped).toMatchObject([
      { type: "event", id: "agent-1" },
      {
        type: "turn_footer",
        id: "turn_footer:agent-1",
        actionsContent: "Done.",
      },
    ]);
  });
});
