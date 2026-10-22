"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "@/lib/clipboard";

/** Copies text and exposes a short-lived `copied` flag for check-icon feedback. */
export function useCopyFeedback(resetAfterMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = useCallback(
    async (text: string) => {
      clearTimeout(timerRef.current);
      const ok = await copyTextToClipboard(text);
      setCopied(ok);
      if (ok) {
        timerRef.current = setTimeout(() => setCopied(false), resetAfterMs);
      }
      return ok;
    },
    [resetAfterMs],
  );

  return { copied, copy };
}
