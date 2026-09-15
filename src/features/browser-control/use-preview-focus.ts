"use client";

import { useEffect, useEffectEvent } from "react";

// Losing page focus ends temporary control; focus never reacquires it.
export function usePreviewFocus(onLeave: () => void) {
  const leave = useEffectEvent(onLeave);
  useEffect(() => {
    const blurred = () => leave();
    const hidden = () => {
      if (document.visibilityState === "hidden") leave();
    };
    window.addEventListener("blur", blurred);
    window.addEventListener("pagehide", blurred);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("blur", blurred);
      window.removeEventListener("pagehide", blurred);
      document.removeEventListener("visibilitychange", hidden);
      leave();
    };
  }, []);
}
