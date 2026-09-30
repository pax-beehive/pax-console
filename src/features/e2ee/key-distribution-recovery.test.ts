/* @vitest-environment jsdom */

import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { beginBrowserPairing, finishBrowserPairing } from "./key-distribution";
import {
  createPairingSecret,
  generatePairingDeviceKey,
  wrapAgentRootKey,
} from "./pairing";
import type { PendingPairing } from "./device-key-store";

const storage = vi.hoisted(() => ({
  pending: new Map<string, PendingPairing>(),
  loadOrCreatePairingDevice: vi.fn(),
  saveRootKey: vi.fn(),
}));
vi.mock("./device-key-store", () => ({
  loadOrCreatePairingDevice: storage.loadOrCreatePairingDevice,
  savePendingPairing: async (value: PendingPairing) => {
    storage.pending.set(value.pairingId, value);
  },
  loadPendingPairing: async (id: string) => storage.pending.get(id),
  deletePendingPairing: async (id: string) => {
    storage.pending.delete(id);
  },
  listPendingPairings: async (agentId: string) =>
    [...storage.pending.values()].filter((p) => p.agentId === agentId),
}));
vi.mock("./root-key-store", () => ({ saveRootKey: storage.saveRootKey }));

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.resetAllMocks();
  storage.pending.clear();
});
afterEach(() => vi.unstubAllGlobals());
function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({ code: status, data, message: "test response" }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("pairing request lifecycle across transport failures", () => {
  it("keeps recovery material when creation committed but the HTTP response was lost", async () => {
    storage.loadOrCreatePairingDevice.mockResolvedValue(
      await generatePairingDeviceKey(),
    );
    let committedPairingId = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        // Model an accepted POST whose response never reaches the browser.
        committedPairingId = JSON.parse(String(init.body)).pairing_id;
        expect(storage.pending.has(committedPairingId)).toBe(true);
        throw new TypeError("Connection lost after server committed");
      }),
    );
    await expect(
      beginBrowserPairing("user_1", "agent_1", "Browser"),
    ).rejects.toThrow("Connection lost");
    expect(committedPairingId).not.toBe("");
    expect(storage.pending.has(committedPairingId)).toBe(true);
  });

  it("Given a lost creation response, when creating again, then a fresh ID is sent and old recovery material remains", async () => {
    storage.loadOrCreatePairingDevice.mockResolvedValue(
      await generatePairingDeviceKey(),
    );
    const ids: string[] = [];
    const deadline = new Date(Date.now() + 600_000).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        ids.push(body.pairing_id);
        if (ids.length === 1) throw new TypeError("Lost response");
        return response({ ...body, expires_at: deadline }, 201);
      }),
    );
    await expect(
      beginBrowserPairing("user_1", "agent_1", "Browser"),
    ).rejects.toThrow();
    const next = await beginBrowserPairing("user_1", "agent_1", "Browser");
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
    expect(next.request.pairing_id).toBe(ids[1]);
    expect(storage.pending.has(ids[0])).toBe(true);
    expect(storage.pending.get(ids[1])?.expiresAt).toBe(deadline);
  });

  it("Given a server error after creation, then recovery material is retained", async () => {
    storage.loadOrCreatePairingDevice.mockResolvedValue(
      await generatePairingDeviceKey(),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(null, 503)),
    );
    await expect(
      beginBrowserPairing("user_1", "agent_1", "Browser"),
    ).rejects.toThrow();
    expect(storage.pending.size).toBe(1);
  });

  it("discards local material on a definitive rejected creation", async () => {
    storage.loadOrCreatePairingDevice.mockResolvedValue(
      await generatePairingDeviceKey(),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(null, 400)),
    );
    await expect(
      beginBrowserPairing("user_1", "agent_1", "Browser"),
    ).rejects.toThrow();
    expect(storage.pending.size).toBe(0);
  });

  it("preserves pending material when no package has arrived yet", async () => {
    const local = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(null, 404)),
    );
    await expect(
      finishBrowserPairing("user_1", "agent_1", local.pairingId),
    ).rejects.toThrow();
    expect(storage.pending.has(local.pairingId)).toBe(true);
    expect(storage.saveRootKey).not.toHaveBeenCalled();
  });

  it("saves an approved key after an interrupted fetch, even beyond the approval deadline", async () => {
    const local = await fixture();
    const root = new Uint8Array(32).fill(7);
    const wrapped = await wrapAgentRootKey(
      root,
      local.publicKey,
      local.secret,
      local,
    );
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Offline"))
      .mockResolvedValueOnce(
        response({
          ...wrapped,
          pairing_id: local.pairingId,
          agent_id: local.agentId,
          device_id: local.deviceId,
          key_epoch: local.keyEpoch,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      finishBrowserPairing("user_1", "agent_1", local.pairingId),
    ).rejects.toThrow("Offline");
    expect(storage.pending.has(local.pairingId)).toBe(true);
    await expect(
      finishBrowserPairing("user_1", "agent_1", local.pairingId),
    ).resolves.toEqual(root);
    expect(storage.saveRootKey).toHaveBeenCalledOnce();
    expect(storage.pending.has(local.pairingId)).toBe(false);
  });

  it("rejects a package for a different request without deleting local recovery material", async () => {
    const local = await fixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response({ pairing_id: "pair_newer" })),
    );
    await expect(
      finishBrowserPairing("user_1", "agent_1", local.pairingId),
    ).rejects.toThrow("route does not match");
    expect(storage.pending.has(local.pairingId)).toBe(true);
    expect(storage.saveRootKey).not.toHaveBeenCalled();
  });
});

async function fixture() {
  const device = await generatePairingDeviceKey();
  const local: PendingPairing = {
    ...device,
    pairingId: "pair_recover",
    agentId: "agent_1",
    keyEpoch: 1,
    secret: createPairingSecret(),
    createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
  };
  storage.pending.set(local.pairingId, local);
  return local;
}
