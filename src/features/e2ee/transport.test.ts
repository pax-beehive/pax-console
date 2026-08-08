import { afterEach, describe, expect, it, vi } from "vitest";
import { encryptEnvelope } from "./envelope";
import {
  postEncryptedCommand,
  prepareEncryptedCommand,
  sendEncryptedCommand,
  streamEncryptedEvents,
} from "./transport";

const rootKey = Uint8Array.from({ length: 32 }, (_, index) => index);

describe("E2EE HTTP and SSE transport", () => {
  afterEach(() => vi.unstubAllGlobals());

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
        JSON.stringify({ frames: [{ first: true }, { second: true }] }),
      ),
    );
    const body = `: heartbeat\n\nid: 8\ndata: ${JSON.stringify(envelope)}\n\n`;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("Last-Event-ID")).toBe("7");
      return new Response(body, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const frames: unknown[] = [];
    const cursors: number[] = [];

    await expect(
      streamEncryptedEvents({
        userId: "self",
        agentId: "agent_1",
        sessionId: "session_1",
        rootKey,
        keyEpoch: 1,
        afterCursor: 7,
        onFrame: (frame) => {
          frames.push(frame);
        },
        onCursor: (cursor) => cursors.push(cursor),
      }),
    ).resolves.toBe(8);
    expect(frames).toEqual([{ first: true }, { second: true }]);
    expect(cursors).toEqual([8]);
  });
});
