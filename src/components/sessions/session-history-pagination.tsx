"use client";

import { useEffect, type RefObject } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  scrollRef: RefObject<HTMLDivElement | null>;
  hasMore: boolean;
  isLoading: boolean;
  hasError: boolean;
  onLoadEarlier: () => void;
};

export function SessionHistoryPagination({
  scrollRef,
  hasMore,
  isLoading,
  hasError,
  onLoadEarlier,
}: Props) {
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !hasMore || isLoading || hasError) return;
    let requested = false;
    const fillViewport = () => {
      // A short latest turn cannot emit a scroll event to request older turns.
      if (
        !requested &&
        container.clientHeight > 0 &&
        container.scrollHeight <= container.clientHeight
      ) {
        requested = true;
        onLoadEarlier();
      }
    };
    fillViewport();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(fillViewport);
    observer.observe(container);
    if (container.firstElementChild)
      observer.observe(container.firstElementChild);
    return () => observer.disconnect();
  }, [scrollRef, hasMore, isLoading, hasError, onLoadEarlier]);

  return (
    <div className="min-h-8 text-center text-xs text-ink-tertiary">
      {isLoading ? (
        <span role="status">Loading earlier messages</span>
      ) : hasMore ? (
        <Button size="sm" variant="ghost" type="button" onClick={onLoadEarlier}>
          {hasError ? "Retry earlier messages" : "Load earlier messages"}
        </Button>
      ) : null}
    </div>
  );
}
