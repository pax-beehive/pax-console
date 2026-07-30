import { Mock, afterEach, describe, expect, it, vi } from "vitest";
import {
  ConversationRunEnvelope,
  parseConversationRunSseBlock,
  streamConversationRun,
} from "./conversation-run";

describe("parseConversationRunSseBlock", () => {
  it("parses default data messages into conversation envelopes", () => {
    const envelope = parseConversationRunSseBlock(
      'data: {"type":"session","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1"}',
    );

    expect(envelope).toEqual({
      type: "session",
      node_id: "node_1",
      agent_id: "agent_1",
      session_id: "sess_1",
    });
  });

  it("parses approval and interruption envelopes", () => {
    const approval = parseConversationRunSseBlock(
      'data: {"type":"approval_required","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1","approval_id":"appr_1","approval":{"approval_id":"appr_1","title":"Run command"},"frame":{"jsonrpc":"2.0","id":"perm_1","method":"session/request_permission"}}',
    );
    const interrupted = parseConversationRunSseBlock(
      'data: {"type":"interrupted","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1","approval_id":"appr_1","reason":"permission_required"}',
    );

    expect(approval).toMatchObject({
      type: "approval_required",
      approval_id: "appr_1",
      approval: {
        approval_id: "appr_1",
        title: "Run command",
      },
    });
    expect(interrupted).toEqual({
      type: "interrupted",
      node_id: "node_1",
      agent_id: "agent_1",
      session_id: "sess_1",
      approval_id: "appr_1",
      reason: "permission_required",
    });
  });
});

describe("streamConversationRun", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts input JSON and reads split server-sent data envelopes", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        streamFromChunks([
          'data: {"type":"session","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1"}\n',
          '\ndata: {"type":"done","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1"}\n\n',
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const envelopes: ConversationRunEnvelope[] = [];

    await streamConversationRun({
      agentId: "agent_1",
      input: "hello",
      nodeId: "node_1",
      onEnvelope: (envelope) => envelopes.push(envelope),
      sessionId: "sess_existing",
      userId: "self",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock as Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "/api/pax/api/v1/user/self/nodes/node_1/agents/agent_1/conversation",
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBe(
      JSON.stringify({ input: "hello", session_id: "sess_existing" }),
    );
    expect(envelopes).toEqual([
      {
        type: "session",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
      },
      {
        type: "done",
        node_id: "node_1",
        agent_id: "agent_1",
        session_id: "sess_1",
      },
    ]);
  });

  it("posts project context, cwd, and approval mode only for new sessions", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        streamFromChunks([
          'data: {"type":"done","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1"}\n\n',
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await streamConversationRun({
      agentId: "agent_1",
      approvalMode: "auto_approve_all",
      cwd: "/Users/demo/project",
      input: "hello",
      nodeId: "node_1",
      onEnvelope: vi.fn(),
      primaryProjectId: "proj_1",
      projectTargetId: "ptgt_1",
      userId: "self",
    });
    await streamConversationRun({
      agentId: "agent_1",
      approvalMode: "auto_approve_all",
      cwd: "/Users/demo/project",
      input: "hello",
      nodeId: "node_1",
      onEnvelope: vi.fn(),
      primaryProjectId: "proj_1",
      projectTargetId: "ptgt_1",
      sessionId: "sess_existing",
      userId: "self",
    });

    const [, newSessionInit] = (fetchMock as Mock).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const [, existingSessionInit] = (fetchMock as Mock).mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(newSessionInit.body).toBe(
      JSON.stringify({
        input: "hello",
        cwd: "/Users/demo/project",
        approval_mode: "auto_approve_all",
        primary_project_id: "proj_1",
        project_target_id: "ptgt_1",
      }),
    );
    expect(existingSessionInit.body).toBe(
      JSON.stringify({ input: "hello", session_id: "sess_existing" }),
    );
  });

  it("posts structured content blocks when attachments are present", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        streamFromChunks([
          'data: {"type":"done","node_id":"node_1","agent_id":"agent_1","session_id":"sess_1"}\n\n',
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await streamConversationRun({
      agentId: "agent_1",
      content: [
        { type: "text", text: "Please review this file" },
        { type: "attachment", attachment_id: "att_1" },
      ],
      nodeId: "node_1",
      onEnvelope: vi.fn(),
      sessionId: "sess_existing",
      userId: "self",
    });

    const [, init] = (fetchMock as Mock).mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({
        content: [
          { type: "text", text: "Please review this file" },
          { type: "attachment", attachment_id: "att_1" },
        ],
        session_id: "sess_existing",
      }),
    );
  });

  it("posts resume JSON for a decided permission approval", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        streamFromChunks([
          'data: {"type":"session","node_id":"node_1","agent_id":"agent_1","session_id":"sess_existing"}\n\n',
          'data: {"type":"done","node_id":"node_1","agent_id":"agent_1","session_id":"sess_existing"}\n\n',
        ]),
        {
          headers: { "content-type": "text/event-stream" },
          status: 200,
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await streamConversationRun({
      agentId: "agent_1",
      nodeId: "node_1",
      onEnvelope: vi.fn(),
      resume: { approvalId: "appr_1" },
      sessionId: "sess_existing",
      userId: "self",
    });

    const [, init] = (fetchMock as Mock).mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(
      JSON.stringify({
        session_id: "sess_existing",
        resume: { approval_id: "appr_1" },
      }),
    );
  });
});

function streamFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}
