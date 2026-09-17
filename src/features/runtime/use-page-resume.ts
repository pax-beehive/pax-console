"use client";

import { useEffect, useRef } from "react";

/** Mobile browsers can suspend streams without rejecting their fetch promises. */
export function usePageResume(onResume: () => void) {
  const callback = useRef(onResume);
  useEffect(() => {
    callback.current = onResume;
  }, [onResume]);

  useEffect(() => {
    let hidden = document.visibilityState === "hidden";
    const onVisibility = () => {
      const nextHidden = document.visibilityState === "hidden";
      const resumed = hidden && !nextHidden;
      hidden = nextHidden;
      if (resumed) callback.current();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        hidden = document.visibilityState === "hidden";
        if (!hidden) callback.current();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);
}
