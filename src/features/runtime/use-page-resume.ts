"use client";

import { useEffect, useRef } from "react";

/** Mobile browsers can suspend streams without rejecting their fetch promises. */
export function usePageResume(
  onResume: () => void,
  { includeWindowFocus = false }: { includeWindowFocus?: boolean } = {},
) {
  const callback = useRef(onResume);
  useEffect(() => {
    callback.current = onResume;
  }, [onResume]);

  useEffect(() => {
    let hidden = document.visibilityState === "hidden";
    let awaitingFocus = !document.hasFocus();
    const resume = () => {
      awaitingFocus = false;
      callback.current();
    };
    const onBlur = () => {
      awaitingFocus = true;
    };
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      // Focus and visibilitychange can describe the same foreground return.
      const resumed = hidden || awaitingFocus;
      hidden = false;
      if (resumed) resume();
    };
    const onVisibility = () => {
      const nextHidden = document.visibilityState === "hidden";
      const resumed = hidden && !nextHidden;
      hidden = nextHidden;
      if (resumed) resume();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        hidden = document.visibilityState === "hidden";
        if (!hidden) resume();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    if (includeWindowFocus) {
      window.addEventListener("blur", onBlur);
      window.addEventListener("focus", onFocus);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [includeWindowFocus]);
}
