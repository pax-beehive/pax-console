/* @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingPairing } from "./device-key-store";
import type { BrowserPairingState } from "./pairing-lifecycle";
import { useBrowserPairing } from "./use-browser-pairing";
const mocks = vi.hoisted(() => ({
  root: vi.fn(),
  begin: vi.fn(),
  list: vi.fn(),
  inspect: vi.fn(),
}));
vi.mock("./root-key-store", () => ({ loadRootKey: mocks.root }));
vi.mock("./key-distribution", () => ({
  beginBrowserPairing: mocks.begin,
  listPendingPairings: mocks.list,
}));
vi.mock("./pairing-lifecycle", async (original) => ({
  ...(await original<typeof import("./pairing-lifecycle")>()),
  inspectBrowserPairing: mocks.inspect,
}));
function local(agentId: string, pairingId = agentId): PendingPairing {
  return {
    agentId,
    pairingId,
    createdAt: new Date().toISOString(),
  } as PendingPairing;
}
function waiting(pending: PendingPairing): BrowserPairingState {
  return { phase: "pending", pending };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  mocks.root.mockResolvedValue(undefined);
  mocks.list.mockImplementation(async (agent: string) => [local(agent)]);
  mocks.inspect.mockImplementation(async (_user: string, p: PendingPairing) =>
    waiting(p),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Given overlapping pairing operations", () => {
  it("when switching agents during creation, then the new agent loads and the old result cannot replace it", async () => {
    const creation = deferred<void>();
    mocks.begin.mockReturnValue(creation.promise);
    const { result, rerender } = renderHook(
      ({ agent }) => useBrowserPairing("user_1", agent),
      { initialProps: { agent: "agent_a" } },
    );
    await act(async () => {});
    let starting!: Promise<void>;
    act(() => {
      starting = result.current.start("Browser");
    });
    rerender({ agent: "agent_b" });
    await act(async () => {});
    expect(result.current.state.pending?.agentId).toBe("agent_b");
    expect(result.current.busy).toBe(false);
    await act(async () => {
      creation.resolve();
      await starting;
    });
    expect(result.current.state.pending?.agentId).toBe("agent_b");
  });

  it("when a new request replaces an in-flight poll, then the stale poll cannot restore the old request", async () => {
    const polling = deferred<BrowserPairingState>();
    const { result } = renderHook(() => useBrowserPairing("user_1", "agent_a"));
    await act(async () => {});
    mocks.inspect.mockReturnValueOnce(polling.promise);
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    mocks.begin.mockImplementation(async () => {
      mocks.list.mockResolvedValue([local("agent_a", "pair_new")]);
    });
    await act(async () => {
      await result.current.start("Browser");
    });
    expect(result.current.state.pending?.pairingId).toBe("pair_new");
    await act(async () => {
      polling.resolve({ phase: "superseded", pending: local("agent_a") });
    });
    expect(result.current.state.phase).toBe("pending");
    expect(result.current.state.pending?.pairingId).toBe("pair_new");
  });
});
