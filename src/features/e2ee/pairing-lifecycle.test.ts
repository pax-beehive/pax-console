/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/features/api/errors";
import type { PendingPairing } from "./device-key-store";
import { inspectBrowserPairing } from "./pairing-lifecycle";

const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  status: vi.fn(),
  save: vi.fn(),
}));
vi.mock("./key-distribution", () => ({
  finishBrowserPairing: mocks.finish,
  getE2EEPairingStatus: mocks.status,
  browserPairingInstructions: (p: PendingPairing) => ({
    pairingId: p.pairingId,
    pairingSecret: "test",
    localCommand: "test",
  }),
  PairingPackageMismatchError: class extends Error {},
}));
vi.mock("./device-key-store", () => ({ savePendingPairing: mocks.save }));
const local = {
  pairingId: "pair_1",
  agentId: "agent_1",
  deviceId: "device_1",
  keyEpoch: 1,
  createdAt: new Date(Date.now() - 20 * 60_000).toISOString(),
} as PendingPairing;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.finish.mockRejectedValue(new ApiError("not found", 404, null));
});

describe("Given a stored pairing, when restoring its lifecycle", () => {
  it.each(["expired", "superseded"])(
    "then a server %s state ends approval waiting",
    async (status) => {
      mocks.status.mockResolvedValue({ status });
      expect((await inspectBrowserPairing("user_1", local)).phase).toBe(status);
    },
  );
  it("then an approved package is recovered before considering the old deadline", async () => {
    mocks.finish.mockResolvedValue(new Uint8Array(32));
    expect((await inspectBrowserPairing("user_1", local)).phase).toBe("ready");
    expect(mocks.status).not.toHaveBeenCalled();
  });
  it("then a live server deadline overrides an old local estimate", async () => {
    const expires_at = new Date(Date.now() + 60_000).toISOString();
    mocks.status.mockResolvedValue({ status: "pending", expires_at });
    const state = await inspectBrowserPairing("user_1", local);
    expect(state.phase).toBe("pending");
    expect(state.pending?.expiresAt).toBe(expires_at);
  });
  it("then offline approval retrieval is unconfirmed, never falsely expired", async () => {
    mocks.finish.mockRejectedValue(new TypeError("Offline"));
    expect((await inspectBrowserPairing("user_1", local)).phase).toBe(
      "unconfirmed",
    );
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("then approved-but-unavailable delivery remains recoverable", async () => {
    mocks.status.mockResolvedValue({ status: "approved" });
    expect((await inspectBrowserPairing("user_1", local)).phase).toBe(
      "unconfirmed",
    );
  });
  it("then a missing request past its deadline is expired, not an endless unknown", async () => {
    mocks.status.mockRejectedValue(new ApiError("not found", 404, null));
    expect((await inspectBrowserPairing("user_1", local)).phase).toBe(
      "expired",
    );
  });
});
