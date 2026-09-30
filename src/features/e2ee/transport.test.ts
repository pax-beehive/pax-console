import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptEnvelope } from "./envelope";
import {
  flattenEncryptedHistoryPages,
  loadEncryptedSessionHistory,
  postEncryptedCommand,
  prepareEncryptedCommand,
  sendEncryptedCommand,
  streamEncryptedEvents,
} from "./transport";

const rootKey = Uint8Array.from({ length: 32 }, (_, index) => index);

describe("E2EE HTTP and SSE transport", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("canonicalizes overlapping history pages by revision and durable order", () => {
    expect(
      flattenEncryptedHistoryPages([
        {
          messages: [
            {
              id: 20,
              message_id: "message_2",
              revision: 1,
              parts: [
                {
                  part_index: 1,
                  part_type: "text",
                  revision: 1,
                  text: "tail",
                },
                {
                  part_index: 0,
                  part_type: "text",
                  revision: 1,
                  text: "stale",
                },
              ],
            },
          ],
          pagination: { has_more: true, next_before_id: 20 },
        },
        {
          messages: [
            { id: 10, message_id: "message_1", revision: 1, parts: [] },
            {
              id: 20,
              message_id: "message_2",
              revision: 2,
              parts: [
                {
                  part_index: 0,
                  part_type: "text",
                  revision: 2,
                  text: "fresh",
                },
              ],
            },
          ],
          pagination: { has_more: false, next_before_id: 0 },
        },
      ]),
    ).toMatchObject([
      { message_id: "message_1" },
      {
        message_id: "message_2",
        revision: 2,
        parts: [
          { part_index: 0, revision: 2, text: "fresh" },
          { part_index: 1, revision: 1, text: "tail" },
        ],
      },
    ]);
  });

  it("posts only an opaque encrypted command", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const envelope = JSON.parse(String(init?.body));
      expect(envelope.payload).not.toContain("private prompt");
      return new Response(
        JSON.stringify({
          code: 202,
          data: {
            command_id: envelope.record_id,
            created: true,
            status: "pending",
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendEncryptedCommand({
        userId: "self",
        agentId: "agent_1",
        sessionId: "session_1",
        keyEpoch: 1,
        rootKey,
        frame: {
          jsonrpc: "2.0",
          method: "session/prompt",
          private: "private prompt",
        },
      }),
    ).resolves.toMatchObject({ created: true, status: "pending" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/pax/api/v1/user/self/agents/agent_1/sessions/session_1/encrypted-commands",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("reposts the exact prepared envelope after an ambiguous HTTP failure", async () => {
    const requestBodies: string[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      requestBodies.push(String(init?.body));
      const envelope = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          code: 202,
          data: {
            command_id: envelope.record_id,
            created: requestBodies.length === 1,
            status: "pending",
          },
        }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const prepared = await prepareEncryptedCommand({
      agentId: "agent_1",
      sessionId: "session_1",
      keyEpoch: 1,
      rootKey,
      frame: { jsonrpc: "2.0", method: "session/prompt" },
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await postEncryptedCommand({
        userId: "self",
        agentId: "agent_1",
        sessionId: "session_1",
        prepared,
      });
    }

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[1]).toBe(requestBodies[0]);
  });

  it("decrypts batches and advances the SSE cursor after processing", async () => {
    const envelope = await encryptEnvelope(
      rootKey,
      "event",
      {
        record_id: "evt_1",
        agent_id: "agent_1",
        session_id: "session_1",
        kind: "acp_event",
        key_epoch: 1,
      },
      new TextEncoder().encode(
        JSON.stringify({
          turn_id: "turn_1",
          frames: [{ first: true }, { second: true }],
        }),
      ),
    );
    const event = `id: 8\ndata: ${JSON.stringify(envelope)}\n\n`;
    const body = `: heartbeat\n\n${event}${event}`;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Last-Event-ID")).toBe("7");
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const frames: unknown[] = [];
    const turnIds: Array<string | undefined> = [];
    const cursors: number[] = [];

    await expect(
      streamEncryptedEvents({
        userId: "self",
        agentId: "agent_1",
        sessionId: "session_1",
        rootKey,
        keyEpoch: 1,
        afterCursor: 7,
        onFrame: (frame, context) => {
          frames.push(frame);
          turnIds.push(context.turnId);
        },
        onCursor: (cursor) => cursors.push(cursor),
      }),
    ).resolves.toBe(8);
    expect(frames).toEqual([{ first: true }, { second: true }]);
    expect(turnIds).toEqual(["turn_1", "turn_1"]);
    expect(cursors).toEqual([8]);
  });

  it("loads opaque canonical history and decrypts it into existing message types", async () => {
    const messageEnvelope = await encryptEnvelope(
      rootKey,
      "event",
      {
        record_id: "history_message_1",
        agent_id: "agent_1",
        session_id: "session_1",
        kind: "e2ee_message",
        key_epoch: 1,
      },
      new TextEncoder().encode(
        JSON.stringify({
          message_id: "message_1",
          revision: 2,
          agent_id: "agent_1",
          session_id: "session_1",
          role: "assistant",
          message_type: "agent_message_chunk",
          created_at: "2026-08-08T01:00:00Z",
        }),
      ),
    );
    const partEnvelope = await encryptEnvelope(
      rootKey,
      "event",
      {
        record_id: "history_part_1",
        agent_id: "agent_1",
        session_id: "session_1",
        kind: "e2ee_message_part",
        key_epoch: 1,
      },
      new TextEncoder().encode(
        JSON.stringify({
          message_id: "message_1",
          part_index: 0,
          revision: 2,
          part_type: "text",
          text: "private answer",
        }),
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: 200,
              data: {
                messages: [
                  {
                    id: 11,
                    message_id: "message_1",
                    revision: 2,
                    envelope: messageEnvelope,
                    parts: [
                      {
                        id: 12,
                        part_index: 0,
                        revision: 2,
                        envelope: partEnvelope,
                        created_at: "2026-08-08T01:00:00Z",
                        updated_at: "2026-08-08T01:00:01Z",
                      },
                    ],
                    created_at: "2026-08-08T01:00:00Z",
                    updated_at: "2026-08-08T01:00:01Z",
                  },
                ],
                pagination: { has_more: false, next_before_id: 0 },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(
      loadEncryptedSessionHistory({
        userId: "self",
        agentId: "agent_1",
        sessionId: "session_1",
        keyEpoch: 1,
        rootKey,
      }),
    ).resolves.toMatchObject({
      messages: [
        {
          id: 11,
          message_id: "message_1",
          parts: [{ id: 12, part_index: 0, text: "private answer" }],
        },
      ],
      pagination: { has_more: false },
    });
  });

  it("rejects a stored revision that does not match authenticated plaintext", async () => {
    const envelope = await encryptEnvelope(
      rootKey,
      "event",
      {
        record_id: "history_message_1",
        agent_id: "agent_1",
        session_id: "session_1",
        kind: "e2ee_message",
        key_epoch: 1,
      },
      new TextEncoder().encode(
        JSON.stringify({
          message_id: "message_1",
          revision: 1,
          agent_id: "agent_1",
          session_id: "session_1",
        }),
      ),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              code: 200,
              data: {
                messages: [
                  {
                    id: 1,
                    message_id: "message_1",
                    revision: 2,
                    envelope,
                    parts: [],
                    created_at: "2026-08-08T01:00:00Z",
                    updated_at: "2026-08-08T01:00:00Z",
                  },
                ],
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    await expect(
      loadEncryptedSessionHistory({
        userId: "self",
        agentId: "agent_1",
        sessionId: "session_1",
        keyEpoch: 1,
        rootKey,
      }),
    ).rejects.toThrow("message metadata mismatch");
  });
  it.each([false, true])(
    "authenticates context pages without disclosing turn metadata (tampered=%s)",
    async (tampered) => {
      const stored = async (id: number, role: string, text: string) => {
        const messageId = `context_${id}`;
        const envelope = await encryptEnvelope(
          rootKey,
          "event",
          {
            record_id: `header_${id}`,
            agent_id: "agent_1",
            session_id: "session_1",
            kind: "e2ee_message",
            key_epoch: 1,
          },
          new TextEncoder().encode(
            JSON.stringify({
              message_id: messageId,
              revision: 1,
              agent_id: "agent_1",
              session_id: "session_1",
              turn_id: "private_turn",
              role,
            }),
          ),
        );
        const part = await encryptEnvelope(
          rootKey,
          "event",
          {
            record_id: `part_${id}`,
            agent_id: "agent_1",
            session_id: "session_1",
            kind: "e2ee_message_part",
            key_epoch: 1,
          },
          new TextEncoder().encode(
            JSON.stringify({
              message_id: messageId,
              revision: 1,
              part_index: 0,
              part_type: "text",
              text,
            }),
          ),
        );
        return {
          id,
          message_id: messageId,
          revision: 1,
          envelope,
          parts: [{ id, part_index: 0, revision: 1, envelope: part }],
        };
      };
      const response = await stored(501, "assistant", "response tail");
      const prompt = await stored(1, "user", "original private prompt");
      if (tampered) prompt.parts[0].envelope.payload = "AAAA";
      const controller = new AbortController();
      const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
        expect(url).not.toContain("private_turn");
        expect(url).not.toContain("original private prompt");
        expect(init?.signal).toBe(controller.signal);
        const older = url.includes("before_id=501");
        return new Response(
          JSON.stringify({
            code: 200,
            data: {
              messages: [older ? prompt : response],
              pagination: { has_more: !older, next_before_id: older ? 0 : 501 },
            },
          }),
          { status: 200 },
        );
      });
      vi.stubGlobal("fetch", fetchMock);
      const request = loadEncryptedSessionHistory({
        agentId: "agent_1",
        sessionId: "session_1",
        userId: "self",
        rootKey,
        keyEpoch: 1,
        signal: controller.signal,
      });
      if (tampered) {
        await expect(request).rejects.toThrow();
      } else {
        const result = await request;
        expect(result.messages.map((message) => message.role)).toEqual([
          "user",
          "assistant",
        ]);
        expect(result.messages[0].parts?.[0].text).toBe(
          "original private prompt",
        );
        expect(result.pagination).toEqual({
          has_more: true,
          next_before_id: 501,
        });
      }
      expect(fetchMock).toHaveBeenCalledTimes(2);
    },
  );
});
