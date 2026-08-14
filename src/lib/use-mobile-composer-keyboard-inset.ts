"use client";

import {
  CSSProperties,
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const MOBILE_KEYBOARD_INSET_MIN = 96;
const MOBILE_MAX_WIDTH = 639;
const SCROLL_BOTTOM_LOCK_THRESHOLD = 96;
const VIEWPORT_GUTTER = 12;

type MobileComposerKeyboardInsetOptions<S extends HTMLElement> = {
  scrollRootRef?: RefObject<S | null>;
};

export function useMobileComposerKeyboardInset<
  T extends HTMLElement,
  S extends HTMLElement = HTMLElement,
>(
  containerRef: RefObject<T | null>,
  options: MobileComposerKeyboardInsetOptions<S> = {},
) {
  const { scrollRootRef } = options;
  const [focusWithin, setFocusWithin] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const blurTimeoutRef = useRef<number | null>(null);
  const syncFrameRef = useRef<number | null>(null);
  const keyboardInsetRef = useRef(0);
  const pendingBottomDistanceRef = useRef<number | null>(null);
  const rootOverflowAnchorRef = useRef<string | null>(null);

  const clearBlurTimeout = useCallback(() => {
    if (blurTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = null;
  }, []);

  const cancelScheduledSync = useCallback(() => {
    if (syncFrameRef.current === null) {
      return;
    }
    window.cancelAnimationFrame(syncFrameRef.current);
    syncFrameRef.current = null;
  }, []);

  const computeKeyboardInset = useCallback(() => {
    if (!focusWithin) {
      return 0;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      return 0;
    }

    const rawInset = Math.max(
      0,
      window.innerHeight - viewport.height - viewport.offsetTop,
    );
    return rawInset >= MOBILE_KEYBOARD_INSET_MIN ? Math.round(rawInset) : 0;
  }, [focusWithin]);

  const getScrollRoot = useCallback(() => {
    const candidate = scrollRootRef?.current;
    return candidate instanceof HTMLElement ? candidate : null;
  }, [scrollRootRef]);

  const captureBottomAnchor = useCallback(() => {
    const scrollRoot = getScrollRoot();
    if (!scrollRoot) {
      pendingBottomDistanceRef.current = null;
      return;
    }

    const distanceFromBottom =
      scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight;
    pendingBottomDistanceRef.current =
      distanceFromBottom <= SCROLL_BOTTOM_LOCK_THRESHOLD
        ? Math.max(0, distanceFromBottom)
        : null;
  }, [getScrollRoot]);

  useLayoutEffect(() => {
    const scrollRoot = getScrollRoot();
    const distanceFromBottom = pendingBottomDistanceRef.current;
    if (!scrollRoot || distanceFromBottom === null) {
      return;
    }

    scrollRoot.scrollTop = Math.max(
      0,
      scrollRoot.scrollHeight - scrollRoot.clientHeight - distanceFromBottom,
    );
    pendingBottomDistanceRef.current = null;
  }, [getScrollRoot, keyboardInset]);

  useEffect(() => {
    keyboardInsetRef.current = keyboardInset;
  }, [keyboardInset]);

  useEffect(() => {
    const scrollRoot = getScrollRoot();
    if (!scrollRoot || !focusWithin) {
      return;
    }

    if (rootOverflowAnchorRef.current === null) {
      rootOverflowAnchorRef.current = scrollRoot.style.overflowAnchor;
    }
    scrollRoot.style.overflowAnchor = "none";

    return () => {
      scrollRoot.style.overflowAnchor = rootOverflowAnchorRef.current ?? "";
      rootOverflowAnchorRef.current = null;
    };
  }, [focusWithin, getScrollRoot]);

  const revealComposer = useCallback(
    (behavior: ScrollBehavior) => {
      if (window.innerWidth > MOBILE_MAX_WIDTH) {
        return;
      }

      const container = containerRef.current;
      const activeElement = document.activeElement;
      if (
        !(container instanceof HTMLElement) ||
        !(activeElement instanceof HTMLElement) ||
        !container.contains(activeElement)
      ) {
        return;
      }

      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      const containerRect = container.getBoundingClientRect();
      const activeRect = activeElement.getBoundingClientRect();
      const hiddenByViewport =
        containerRect.bottom > viewportHeight - VIEWPORT_GUTTER ||
        activeRect.bottom > viewportHeight - VIEWPORT_GUTTER ||
        activeRect.top < VIEWPORT_GUTTER;

      if (!hiddenByViewport) {
        return;
      }

      container.scrollIntoView({
        behavior,
        block: "end",
        inline: "nearest",
      });
    },
    [containerRef],
  );

  const syncViewport = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      const nextInset = computeKeyboardInset();
      if (nextInset !== keyboardInsetRef.current) {
        captureBottomAnchor();
        keyboardInsetRef.current = nextInset;
        setKeyboardInset(nextInset);
      }
      revealComposer(behavior);
    },
    [captureBottomAnchor, computeKeyboardInset, revealComposer],
  );

  const scheduleViewportSync = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      cancelScheduledSync();
      syncFrameRef.current = window.requestAnimationFrame(() => {
        syncFrameRef.current = null;
        syncViewport(behavior);
      });
    },
    [cancelScheduledSync, syncViewport],
  );

  useEffect(() => {
    if (!focusWithin) {
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      scheduleViewportSync();
      return;
    }

    const scheduleUpdate = () => {
      const rawInset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      const behavior =
        rawInset >= MOBILE_KEYBOARD_INSET_MIN && keyboardInsetRef.current === 0
          ? "smooth"
          : "auto";
      scheduleViewportSync(behavior);
    };

    scheduleUpdate();
    viewport.addEventListener("resize", scheduleUpdate);
    viewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      cancelScheduledSync();
      viewport.removeEventListener("resize", scheduleUpdate);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [cancelScheduledSync, focusWithin, scheduleViewportSync]);

  useEffect(
    () => () => {
      clearBlurTimeout();
      cancelScheduledSync();
    },
    [cancelScheduledSync, clearBlurTimeout],
  );

  const handleFocusCapture = useCallback(() => {
    clearBlurTimeout();
    setFocusWithin(true);
    scheduleViewportSync();
  }, [clearBlurTimeout, scheduleViewportSync]);

  const handleBlurCapture = useCallback(() => {
    clearBlurTimeout();
    blurTimeoutRef.current = window.setTimeout(() => {
      const activeElement = document.activeElement;
      if (
        activeElement instanceof globalThis.Node &&
        containerRef.current?.contains(activeElement)
      ) {
        return;
      }
      cancelScheduledSync();
      keyboardInsetRef.current = 0;
      pendingBottomDistanceRef.current = null;
      setKeyboardInset(0);
      setFocusWithin(false);
    }, 0);
  }, [cancelScheduledSync, clearBlurTimeout, containerRef]);

  return {
    composerPaddingStyle: {
      paddingBottom: `calc(max(0.75rem, env(safe-area-inset-bottom)) + ${keyboardInset}px)`,
    } satisfies CSSProperties,
    handleBlurCapture,
    handleFocusCapture,
  };
}
