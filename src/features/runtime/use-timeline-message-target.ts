"use client";

import { RefObject, useEffect, useLayoutEffect, useRef } from "react";
import type { WorkstreamItem } from "./session-events";

export function isMessageTarget(item: WorkstreamItem, messageId?: string) {
  return Boolean(
    messageId &&
    item.type === "event" &&
    item.event.historyMessageId === messageId,
  );
}

export function useTimelineMessageTarget({
  scrollRef,
  messageId,
  items,
  ready,
  onLocate,
}: {
  scrollRef: RefObject<HTMLElement | null>;
  messageId?: string;
  items: WorkstreamItem[];
  ready: boolean;
  onLocate: () => void;
}) {
  const located = useRef<{ messageId: string; row: HTMLElement } | undefined>(
    undefined,
  );
  const highlightTimer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(highlightTimer.current);
      if (located.current)
        delete located.current.row.dataset.messageHighlighted;
      located.current = undefined;
    },
    [],
  );
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!messageId || !ready) {
      window.clearTimeout(highlightTimer.current);
      if (located.current)
        delete located.current.row.dataset.messageHighlighted;
      located.current = undefined;
      return;
    }
    if (!container) return;
    // IDs are opaque; never interpolate them into CSS selectors.
    const row = [
      ...container.querySelectorAll<HTMLElement>("[data-target-message-id]"),
    ].find((element) => element.dataset.targetMessageId === messageId);
    if (
      !row ||
      (located.current?.messageId === messageId && located.current.row === row)
    )
      return;
    window.clearTimeout(highlightTimer.current);
    if (located.current) delete located.current.row.dataset.messageHighlighted;
    onLocate();
    container.scrollTop +=
      row.getBoundingClientRect().top -
      container.getBoundingClientRect().top -
      24;
    row.focus({ preventScroll: true });
    row.dataset.messageHighlighted = "true";
    located.current = { messageId, row };
    highlightTimer.current = window.setTimeout(() => {
      delete row.dataset.messageHighlighted;
    }, 5000);
  }, [messageId, items, ready, scrollRef, onLocate]);
}
