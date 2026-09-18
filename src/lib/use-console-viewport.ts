"use client";

import { type RefObject, useLayoutEffect } from "react";

// Own viewport sizing once, outside React's render cycle. iPad hardware-keyboard
// accessory bars can be much shorter than a software keyboard.
export function useConsoleViewport(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const shell = ref.current;
    if (!shell) return;
    const root = document.documentElement;
    const previous = root.getAttribute("data-console-viewport");
    root.setAttribute("data-console-viewport", "");
    const viewport = window.visualViewport;
    let frame: number | undefined;
    let lastHeight = -1;
    let lastTop = -1;

    const sync = () => {
      frame = undefined;
      // Pinch zoom should pan/zoom normally, not reflow the app to a tiny height.
      if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
      const height = Math.round(viewport?.height ?? window.innerHeight);
      const top = Math.max(0, Math.round(viewport?.offsetTop ?? 0));
      if (height <= 0 || (height === lastHeight && top === lastTop)) return;

      const anchors = Array.from(
        shell.querySelectorAll<HTMLElement>("[data-viewport-scroll]"),
        (element) => ({
          element,
          top: element.scrollTop,
          bottom:
            element.scrollHeight - element.clientHeight - element.scrollTop,
        }),
      );
      shell.style.setProperty("--console-viewport-height", `${height}px`);
      shell.style.setProperty("--console-viewport-top", `${top}px`);
      lastHeight = height;
      lastTop = top;
      for (const anchor of anchors) {
        anchor.element.scrollTop =
          anchor.bottom <= 96
            ? Math.max(
                0,
                anchor.element.scrollHeight -
                  anchor.element.clientHeight -
                  Math.max(0, anchor.bottom),
              )
            : anchor.top;
      }
    };
    const schedule = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(sync);
    };
    sync();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      shell.style.removeProperty("--console-viewport-height");
      shell.style.removeProperty("--console-viewport-top");
      if (previous === null) root.removeAttribute("data-console-viewport");
      else root.setAttribute("data-console-viewport", previous);
    };
  }, [ref]);
}
