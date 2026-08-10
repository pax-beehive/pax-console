// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserPairingInstructions,
  completeE2EEPairingRequest,
  createE2EEPairingRequest,
  getE2EEKeyPackage,
  listE2EEPairingRequests,
} from "./key-distribution";
import type { PendingPairing } from "./device-key-store";

describe("E2EE key distribution API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("creates an opaque browser request and loads the device package", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body).not.toHaveProperty("pairing_secret");
        return jsonResponse({ pairing_id: "pair_1", ...body }, 201);
      }
      return jsonResponse({
        pairing_id: "pair_1",
        agent_id: "agent_1",
        device_id: "device_1",
        key_epoch: 1,
        recipient_public_key: "recipient",
        sender_ephemeral_public_key: "sender",
        nonce: "nonce",
        ciphertext: "opaque",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await createE2EEPairingRequest("self", "agent_1", {
      pairing_id: "pair_1",
      device_id: "device_1",
      device_name: "Chrome",
      key_epoch: 1,
      recipient_public_key: "recipient",
      secret_commitment: "commitment",
    });
    await getE2EEKeyPackage("self", "agent_1", "device_1", 1);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/pax/api/v1/user/self/agents/agent_1/e2ee/pairings",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/pax/api/v1/user/self/agents/agent_1/e2ee/key-packages/device_1?key_epoch=1",
    );
  });

  it("lists approval requests and publishes only the wrapped package", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method !== "POST") {
        return jsonResponse([]);
      }
      expect(JSON.parse(String(init.body))).toEqual({
        sender_ephemeral_public_key: "sender",
        nonce: "nonce",
        ciphertext: "ciphertext",
      });
      return jsonResponse({ pairing_id: "pair_1" }, 201);
    });
    vi.stubGlobal("fetch", fetchMock);

    await listE2EEPairingRequests("self", "agent_1");
    await completeE2EEPairingRequest("self", "agent_1", "pair_1", {
      recipient_public_key: "recipient",
      sender_ephemeral_public_key: "sender",
      nonce: "nonce",
      ciphertext: "ciphertext",
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "/api/pax/api/v1/user/self/agents/agent_1/e2ee/pairings/pair_1/package",
    );
  });

  it("rebuilds the local confirmation command after a page reload", () => {
    const pending = {
      pairingId: "pair_reload_1",
      agentId: "agent_1",
      deviceId: "device_1",
      keyEpoch: 1,
      secret: new Uint8Array([1, 2, 3, 4]),
    } as PendingPairing;

    const instructions = browserPairingInstructions(pending);

    expect(instructions.pairingId).toBe("pair_reload_1");
    expect(instructions.pairingSecret).toBe("AQIDBA==");
    expect(instructions.localCommand).toContain(
      "/v1/e2ee/pairings/pair_reload_1/complete",
    );
    expect(instructions.localCommand).toContain('"agent_id":"agent_1"');
    expect(instructions.localCommand).toContain(
      '"pairing_secret":"AQIDBA=="',
    );
  });
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ code: status, data, message: "ok" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
