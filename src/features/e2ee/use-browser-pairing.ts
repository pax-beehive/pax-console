"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/features/api/errors";
import { loadRootKey } from "./root-key-store";
import { beginBrowserPairing, listPendingPairings } from "./key-distribution";
import {
  inspectBrowserPairing,
  pairingDeadline,
  type BrowserPairingState,
} from "./pairing-lifecycle";

export type PairingFlowState = Partial<Omit<BrowserPairingState, "phase">> & {
  phase: BrowserPairingState["phase"] | "loading" | "idle" | "error";
};

const loadingState: PairingFlowState = { phase: "loading" };
const errorState: PairingFlowState = {
  phase: "error",
  message:
    "Could not check encryption access. Check again before starting a new request.",
};

export function useBrowserPairing(userId: string, agentId: string) {
  const [stored, setStored] = useState<{
    agentId: string;
    value: PairingFlowState;
  }>({ agentId, value: { phase: "loading" } });
  const [startingAgent, setStartingAgent] = useState<string>();
  const busy = startingAgent === agentId;
  const operation = useRef(0);
  const starting = useRef<{ agentId: string; operation: number } | undefined>(
    undefined,
  );
  const state: PairingFlowState =
    stored.agentId === agentId ? stored.value : loadingState;

  const restore = useCallback(async (): Promise<PairingFlowState> => {
    if (await loadRootKey(agentId)) return { phase: "ready" };
    const candidates = (await listPendingPairings(agentId)).sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    );
    let ended: BrowserPairingState | undefined;
    for (const candidate of candidates) {
      const result = await inspectBrowserPairing(userId, candidate);
      if (result.phase !== "expired" && result.phase !== "superseded")
        return result;
      ended ??= result;
    }
    return ended ?? { phase: "idle" };
  }, [agentId, userId]);

  const refresh = useCallback(async () => {
    if (!agentId || starting.current?.agentId === agentId) return;
    const current = ++operation.current;
    try {
      const value = await restore();
      if (current === operation.current) setStored({ agentId, value });
    } catch {
      if (current === operation.current)
        setStored({
          agentId,
          value: {
            phase: "error",
            message:
              "Could not check encryption access. Check again before starting a new request.",
          },
        });
    }
  }, [agentId, restore]);

  useEffect(() => {
    if (!agentId) return;
    let active = true;
    const current = ++operation.current;
    void restore()
      .then((value) => {
        if (active && current === operation.current)
          setStored({ agentId, value });
      })
      .catch(() => {
        if (active && current === operation.current)
          setStored({ agentId, value: errorState });
      });
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [agentId, restore, refresh]);

  useEffect(() => {
    const pending = state.pending;
    if (
      !pending ||
      (state.phase !== "pending" && state.phase !== "unconfirmed")
    )
      return;
    if (
      state.phase === "unconfirmed" &&
      !(pairingDeadline(pending) > Date.now())
    )
      return;
    let active = true;
    let checking = false;
    const current = operation.current;
    const timer = window.setInterval(async () => {
      if (checking || starting.current?.agentId === agentId) return;
      checking = true;
      try {
        const value = await inspectBrowserPairing(userId, pending);
        if (active && current === operation.current)
          setStored({ agentId, value });
      } finally {
        checking = false;
      }
    }, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [agentId, userId, state]);

  async function start(deviceName: string) {
    if (!agentId || starting.current?.agentId === agentId) return;
    const current = ++operation.current;
    starting.current = { agentId, operation: current };
    setStartingAgent(agentId);
    try {
      await beginBrowserPairing(userId, agentId, deviceName);
      const value = await restore();
      if (current === operation.current) setStored({ agentId, value });
    } catch (error) {
      const rejected =
        error instanceof ApiError &&
        [400, 403, 404, 409, 422, 429].includes(error.status);
      const candidates = await listPendingPairings(agentId).catch(() => []);
      candidates.sort(
        (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
      if (current === operation.current)
        setStored({
          agentId,
          value: {
            phase: rejected ? "error" : "unconfirmed",
            pending: candidates[0],
            message: rejected
              ? "The pairing request was rejected. You can create a new request."
              : "The creation result is unknown. Check again or create a new request; recovery data is preserved.",
          },
        });
    } finally {
      if (starting.current?.operation === current) {
        starting.current = undefined;
        setStartingAgent(undefined);
      }
    }
  }

  return { state, busy, start, refresh };
}
