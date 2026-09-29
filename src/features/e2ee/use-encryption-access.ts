"use client";

import { useEffect, useState } from "react";
import { loadRootKey } from "./root-key-store";

type AccessStatus = "checking" | "ready" | "missing" | "error";

// Keep only readiness in React state, never the key or a server query cache.
export function useEncryptionAccess(agentId?: string) {
  const [result, setResult] = useState<{
    agentId: string;
    status: AccessStatus;
  }>();

  useEffect(() => {
    if (!agentId) return;
    let active = true;
    let generation = 0;
    const check = async () => {
      const current = ++generation;
      try {
        const key = await loadRootKey(agentId);
        if (active && current === generation) {
          setResult({ agentId, status: key ? "ready" : "missing" });
        }
      } catch {
        if (active && current === generation) {
          setResult({ agentId, status: "error" });
        }
      }
    };
    void check();
    window.addEventListener("focus", check);
    return () => {
      active = false;
      window.removeEventListener("focus", check);
    };
  }, [agentId]);

  return agentId && result?.agentId === agentId ? result.status : "checking";
}
