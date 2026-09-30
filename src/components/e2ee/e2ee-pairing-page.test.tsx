/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/features/api/errors";
import type { PendingPairing } from "@/features/e2ee/device-key-store";
import type { E2EEPairingRequest } from "@/features/e2ee/key-distribution";
import { E2EEPairingRoute } from "./e2ee-pairing-page";

const mocks = vi.hoisted(() => ({
  loadRootKey: vi.fn(),
  listE2EEPairingRequests: vi.fn(),
  listPendingPairings: vi.fn(),
  finishBrowserPairing: vi.fn(),
  getE2EEPairingStatus: vi.fn(),
  beginBrowserPairing: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("agentId=agent_1"),
}));
vi.mock("@/features/auth/auth-gate", () => ({
  AuthGate: ({
    children,
  }: {
    children: (user: { user_id: string }) => ReactNode;
  }) => children({ user_id: "user_1" }),
}));
vi.mock("@/components/shell/console-layout", () => ({
  ConsoleLayout: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/features/api/resources", () => ({
  useAgents: () => ({
    data: {
      agents: [{ agent_id: "agent_1", node_id: "node_1", name: "Test agent" }],
    },
  }),
  useNodes: () => ({ data: { nodes: [] } }),
}));
vi.mock("@/features/e2ee/device-key-store", () => ({
  savePendingPairing: vi.fn(),
  listPendingPairings: mocks.listPendingPairings,
}));
vi.mock("@/features/e2ee/root-key-store", () => ({
  loadRootKey: mocks.loadRootKey,
}));
vi.mock("@/features/e2ee/key-distribution", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/e2ee/key-distribution")
  >()),
  listE2EEPairingRequests: mocks.listE2EEPairingRequests,
  listPendingPairings: mocks.listPendingPairings,
  finishBrowserPairing: mocks.finishBrowserPairing,
  getE2EEPairingStatus: mocks.getE2EEPairingStatus,
  beginBrowserPairing: mocks.beginBrowserPairing,
}));

const now = new Date("2026-09-30T12:00:00Z");
function pending(id: string, ageMinutes = 0): PendingPairing {
  return {
    pairingId: id,
    agentId: "agent_1",
    deviceId: "device_1",
    keyEpoch: 1,
    createdAt: new Date(now.getTime() - ageMinutes * 60_000).toISOString(),
    privateKey: {} as CryptoKey,
    publicKey: new Uint8Array(65),
    secret: new Uint8Array(16),
  };
}
function request(local: PendingPairing): E2EEPairingRequest {
  return {
    pairing_id: local.pairingId,
    agent_id: local.agentId,
    node_id: "node_1",
    device_id: local.deviceId,
    device_name: "Browser",
    key_epoch: 1,
    created_at: local.createdAt,
    expires_at: new Date(
      Date.parse(local.createdAt) + 10 * 60_000,
    ).toISOString(),
    recipient_public_key: "opaque",
    secret_commitment: "opaque",
  };
}
async function openPage() {
  render(
    <TooltipProvider>
      <E2EEPairingRoute />
    </TooltipProvider>,
  );
  await act(async () => {});
  expect(mocks.listPendingPairings).toHaveBeenCalledWith("agent_1");
}
async function chooseMethod() {
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: /Get access from the paxd computer/ }),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.resetAllMocks();
  mocks.loadRootKey.mockResolvedValue(undefined);
  mocks.listE2EEPairingRequests.mockResolvedValue([]);
  mocks.listPendingPairings.mockResolvedValue([]);
  mocks.getE2EEPairingStatus.mockImplementation(
    async (_user, _agent, id: string) => {
      const requests = await mocks.listE2EEPairingRequests();
      const current = requests.find(
        (r: E2EEPairingRequest) => r.pairing_id === id,
      );
      if (current)
        return {
          ...current,
          status:
            Date.parse(current.expires_at) > Date.now() ? "pending" : "expired",
        };
      return { status: requests.length ? "superseded" : "expired" };
    },
  );
  mocks.finishBrowserPairing.mockRejectedValue(
    new ApiError("not found", 404, null),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("pairing recovery and orphan request diagnostics", () => {
  it("allows a browser with no pending request to start pairing", async () => {
    await openPage();
    expect(
      screen.getByRole("button", { name: "Add this browser" }),
    ).toBeEnabled();
  });

  it("expired local request must not permanently block pairing after reload", async () => {
    mocks.listPendingPairings.mockResolvedValue([pending("pair_expired", 20)]);
    await openPage();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mocks.finishBrowserPairing).toHaveBeenCalledWith(
      "user_1",
      "agent_1",
      "pair_expired",
    );
    expect(
      screen.getByRole("button", { name: "Add this browser" }),
    ).toBeEnabled();
  });

  it("reload must resume the current request instead of its superseded predecessor", async () => {
    const old = pending("pair_a_old", 1);
    const current = pending("pair_b_current");
    mocks.listPendingPairings.mockResolvedValue([old, current]);
    mocks.listE2EEPairingRequests.mockResolvedValue([request(current)]);
    await openPage();
    await chooseMethod();
    expect(mocks.finishBrowserPairing).toHaveBeenCalledWith(
      "user_1",
      "agent_1",
      current.pairingId,
    );
  });

  it("an open page must leave waiting state once an unapproved request expires", async () => {
    const local = pending("pair_live");
    mocks.listPendingPairings.mockResolvedValue([local]);
    mocks.listE2EEPairingRequests.mockResolvedValue([request(local)]);
    await openPage();
    await chooseMethod();
    mocks.listE2EEPairingRequests.mockResolvedValue([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11 * 60_000);
    });
    expect(mocks.finishBrowserPairing.mock.calls.length).toBeGreaterThan(1);
    expect(
      screen.queryByText("Waiting for encryption access…"),
    ).not.toBeInTheDocument();
  });

  it("recovers an approved package after reload even past the request deadline", async () => {
    mocks.listPendingPairings.mockResolvedValue([pending("pair_approved", 20)]);
    mocks.finishBrowserPairing.mockResolvedValue(new Uint8Array(32));
    await openPage();
    expect(
      screen.getByRole("button", { name: "This browser is ready" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Waiting for encryption access…"),
    ).not.toBeInTheDocument();
  });

  it("retries a transient network failure and completes when the package is available", async () => {
    const local = pending("pair_retry");
    mocks.listPendingPairings.mockResolvedValue([local]);
    mocks.listE2EEPairingRequests.mockResolvedValue([request(local)]);
    mocks.finishBrowserPairing
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Uint8Array(32));
    await openPage();
    expect(
      screen.getByRole("button", { name: "Create new request" }),
    ).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Could not retrieve");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });
    expect(
      screen.getByRole("button", { name: "This browser is ready" }),
    ).toBeInTheDocument();
    expect(mocks.finishBrowserPairing).toHaveBeenCalledTimes(2);
  });
  it("Given an uncertain creation, when the user starts again, then a new request can proceed", async () => {
    await openPage();
    const uncertain = pending("pair_unknown");
    mocks.beginBrowserPairing.mockImplementationOnce(async () => {
      mocks.listPendingPairings.mockResolvedValue([uncertain]);
      throw new TypeError("Lost response");
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add this browser" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "creation result is unknown",
    );
    const fresh = pending("pair_fresh");
    fresh.createdAt = new Date(now.getTime() + 1).toISOString();
    mocks.beginBrowserPairing.mockImplementationOnce(async () => {
      mocks.listPendingPairings.mockResolvedValue([uncertain, fresh]);
      mocks.listE2EEPairingRequests.mockResolvedValue([request(fresh)]);
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: "Create new request" }),
      );
    });
    await chooseMethod();
    expect(screen.getByText(/pair_fresh\/complete/)).toBeInTheDocument();
    expect(mocks.beginBrowserPairing).toHaveBeenCalledTimes(2);
  });

  it("Given a superseded request, when its status is known, then automatic polling stops", async () => {
    const local = pending("pair_ended");
    mocks.listPendingPairings.mockResolvedValue([local]);
    mocks.getE2EEPairingStatus.mockResolvedValue({ status: "superseded" });
    await openPage();
    expect(screen.getByRole("status")).toHaveTextContent("was replaced");
    const calls = mocks.finishBrowserPairing.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.finishBrowserPairing).toHaveBeenCalledTimes(calls);
    expect(
      screen.getByRole("button", { name: "Add this browser" }),
    ).toBeEnabled();
  });

  it("Given a network outage past the deadline, then waiting is bounded but manual recovery remains available", async () => {
    mocks.listPendingPairings.mockResolvedValue([pending("pair_offline", 20)]);
    mocks.finishBrowserPairing.mockRejectedValue(new TypeError("Offline"));
    await openPage();
    const calls = mocks.finishBrowserPairing.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(mocks.finishBrowserPairing).toHaveBeenCalledTimes(calls);
    expect(
      screen.getByRole("button", { name: "Create new request" }),
    ).toBeEnabled();
    mocks.finishBrowserPairing.mockResolvedValue(new Uint8Array(32));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    });
    expect(
      screen.getByRole("button", { name: "This browser is ready" }),
    ).toBeInTheDocument();
  });
});
