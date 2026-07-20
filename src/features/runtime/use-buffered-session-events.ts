"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeEvents } from "./merge-session-events";
import { SessionEvent } from "./session-events";

const DEFAULT_FLUSH_INTERVAL_MS = 40;

type PendingEventOperation =
  | { type: "append"; events: SessionEvent[] }
  | {
      type: "update";
      update: (events: SessionEvent[]) => SessionEvent[];
    };

export function useBufferedSessionEvents(
  flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
) {
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const pendingRef = useRef<PendingEventOperation[]>([]);
  const timeoutRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(
    null,
  );

  const flush = useCallback(() => {
    if (timeoutRef.current !== null) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const operations = pendingRef.current;
    if (operations.length === 0) {
      return;
    }
    pendingRef.current = [];
    setEvents((current) => applyPendingEventOperations(current, operations));
  }, []);

  const scheduleFlush = useCallback(() => {
    if (timeoutRef.current !== null) {
      return;
    }

    timeoutRef.current = globalThis.setTimeout(flush, flushIntervalMs);
  }, [flush, flushIntervalMs]);

  const append = useCallback(
    (incoming: SessionEvent[]) => {
      if (incoming.length === 0) {
        return;
      }
      pendingRef.current.push({ type: "append", events: incoming });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const update = useCallback(
    (updateEvents: (events: SessionEvent[]) => SessionEvent[]) => {
      pendingRef.current.push({ type: "update", update: updateEvents });
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const reset = useCallback(() => {
    if (timeoutRef.current !== null) {
      globalThis.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    pendingRef.current = [];
    setEvents([]);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) {
        globalThis.clearTimeout(timeoutRef.current);
      }
      pendingRef.current = [];
    },
    [],
  );

  return { append, events, flush, reset, update };
}

export function appendSessionEvents(
  current: SessionEvent[],
  incoming: SessionEvent[],
) {
  if (incoming.length === 0) {
    return current;
  }
  return mergeEvents([...current, ...incoming]);
}

function applyPendingEventOperations(
  current: SessionEvent[],
  operations: PendingEventOperation[],
) {
  let next = current;
  let appended: SessionEvent[] = [];

  const flushAppended = () => {
    if (appended.length === 0) {
      return;
    }
    next = appendSessionEvents(next, appended);
    appended = [];
  };

  for (const operation of operations) {
    if (operation.type === "append") {
      appended.push(...operation.events);
      continue;
    }

    flushAppended();
    next = operation.update(next);
  }

  flushAppended();
  return next;
}
