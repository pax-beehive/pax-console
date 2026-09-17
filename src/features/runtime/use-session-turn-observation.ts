"use client";

import { useCallback, useEffect, useState } from "react";

// A stale runtime report must not repeatedly reopen a completed observer, but
// it must never prevent discovery of the next turn in the same session.
export function useSessionTurnObservation(
  sessionId: string | undefined,
  turnId: string | undefined,
  running: boolean,
) {
  const key = JSON.stringify([sessionId, turnId]);
  const [suppressedKey, setSuppressedKey] = useState<string | null>(null);
  const suppress = useCallback(() => setSuppressedKey(key), [key]);

  useEffect(() => {
    if (running || suppressedKey !== key) return;
    const timer = window.setTimeout(() => setSuppressedKey(null), 0);
    return () => window.clearTimeout(timer);
  }, [key, running, suppressedKey]);

  return {
    turnId: running ? turnId : undefined,
    suppressed: suppressedKey === key,
    suppress,
  };
}
