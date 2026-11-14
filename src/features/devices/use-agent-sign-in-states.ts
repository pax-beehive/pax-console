"use client";

import { useEffect, useState } from "react";
import { getNodeHarnessAuth } from "@/features/api/resources";
import type { LoginHarness } from "@/features/api/types";

export type AgentSignInState = "signed-in" | "signed-out";

/**
 * Whether each agent type on one device is signed in, read once from the
 * device. Only that yes/no is kept: no account detail or sign-in challenge
 * stays in memory. A type that cannot be checked is left out, so the caller
 * shows nothing rather than a guess.
 */
export function useAgentSignInStates(
  userId: string,
  nodeId: string,
  agentTypes: readonly LoginHarness[],
  enabled: boolean,
): Record<string, AgentSignInState | undefined> {
  const [states, setStates] = useState<Record<string, AgentSignInState>>({});
  const key = agentTypes.join(",");
  useEffect(() => {
    if (!enabled || !key) return;
    const controller = new AbortController();
    for (const agentType of key.split(",")) {
      getNodeHarnessAuth(
        userId,
        nodeId,
        agentType,
        undefined,
        controller.signal,
      )
        .then(({ harness_auth: view }) => {
          if (controller.signal.aborted || view.logged_in === undefined) return;
          setStates((current) => ({
            ...current,
            [agentType]: view.logged_in ? "signed-in" : "signed-out",
          }));
        })
        .catch(() => {
          /* The hint is optional; the sign-in page reports failures. */
        });
    }
    return () => controller.abort();
  }, [enabled, key, nodeId, userId]);
  return enabled ? states : {};
}
