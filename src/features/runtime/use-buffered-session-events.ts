"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeEvents } from "./merge-session-events";
import { SessionEvent } from "./session-events";

const DEFAULT_FLUSH_INTERVAL_MS = 32;
// Keep a newly received block visually streaming without making the UI trail
// the actual response for more than roughly half a second.
const TARGET_REVEAL_FRAMES = 18;

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
  const revealBudgetRef = useRef(1);
  const intervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(
    null,
  );

  const flush = useCallback(() => {
    const operations = pendingRef.current;
    if (operations.length === 0) {
      if (intervalRef.current !== null) {
        globalThis.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    const { applied, pending } = takePendingEventOperations(
      operations,
      revealBudgetRef.current,
    );
    pendingRef.current = pending;
    if (applied.length > 0) {
      setEvents((current) => applyPendingEventOperations(current, applied));
    }
    if (pendingRef.current.length === 0) {
      if (intervalRef.current !== null) {
        globalThis.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      revealBudgetRef.current = 1;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (intervalRef.current !== null) {
      return;
    }

    intervalRef.current = globalThis.setInterval(flush, flushIntervalMs);
  }, [flush, flushIntervalMs]);

  const append = useCallback(
    (incoming: SessionEvent[]) => {
      if (incoming.length === 0) {
        return;
      }
      pendingRef.current.push({ type: "append", events: incoming });
      revealBudgetRef.current = Math.max(
        revealBudgetRef.current,
        streamingGraphemeBudget(pendingRef.current),
      );
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
    if (intervalRef.current !== null) {
      globalThis.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    pendingRef.current = [];
    revealBudgetRef.current = 1;
    setEvents([]);
  }, []);

  useEffect(
    () => () => {
      if (intervalRef.current !== null) {
        globalThis.clearInterval(intervalRef.current);
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

function takePendingEventOperations(
  operations: PendingEventOperation[],
  initialRevealBudget: number,
) {
  let revealBudget = initialRevealBudget;
  const applied: PendingEventOperation[] = [];

  for (
    let operationIndex = 0;
    operationIndex < operations.length;
    operationIndex += 1
  ) {
    const operation = operations[operationIndex];
    if (operation.type === "update") {
      applied.push(operation);
      continue;
    }

    const appliedEvents: SessionEvent[] = [];
    for (
      let eventIndex = 0;
      eventIndex < operation.events.length;
      eventIndex += 1
    ) {
      const event = operation.events[eventIndex];
      if (!isAnimatedTextEvent(event)) {
        appliedEvents.push(event);
        continue;
      }

      const graphemes = splitGraphemes(event.content);
      const revealCount = Math.min(graphemes.length, revealBudget);
      if (revealCount > 0) {
        appliedEvents.push({
          ...event,
          content: graphemes.slice(0, revealCount).join(""),
        });
        revealBudget -= revealCount;
      }

      if (revealCount < graphemes.length) {
        if (appliedEvents.length > 0) {
          applied.push({ type: "append", events: appliedEvents });
        }
        return {
          applied,
          pending: [
            {
              type: "append" as const,
              events: [
                {
                  ...event,
                  content: graphemes.slice(revealCount).join(""),
                },
                ...operation.events.slice(eventIndex + 1),
              ],
            },
            ...operations.slice(operationIndex + 1),
          ],
        };
      }
    }

    if (appliedEvents.length > 0) {
      applied.push({ type: "append", events: appliedEvents });
    }
  }

  return { applied, pending: [] };
}

function streamingGraphemeBudget(operations: PendingEventOperation[]) {
  let count = 0;
  for (const operation of operations) {
    if (operation.type !== "append") {
      continue;
    }
    for (const event of operation.events) {
      if (isAnimatedTextEvent(event)) {
        count += splitGraphemes(event.content).length;
      }
    }
  }
  return Math.max(1, Math.ceil(count / TARGET_REVEAL_FRAMES));
}

function isAnimatedTextEvent(
  event: SessionEvent,
): event is Extract<SessionEvent, { type: "agent_message" }> {
  return (
    event.type === "agent_message" &&
    event.streaming === true &&
    event.content.length > 0
  );
}

const graphemeSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;

function splitGraphemes(value: string) {
  if (!graphemeSegmenter) {
    return Array.from(value);
  }
  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}
