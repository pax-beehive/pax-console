"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  dismissSessionFromDeck,
  readSessionDeck,
  rememberSessionInDeck,
  reorderSessionDeck,
  restoreSessionToDeck,
  sessionDeckStorageKey,
  writeSessionDeck,
} from "./session-deck";

const sessionDeckChangedEvent = "pax-console:session-deck-change";
const emptySessionDeckSnapshot = "[]";

export function useSessionDeck(userId: string) {
  const storageKey = sessionDeckStorageKey(userId);

  const subscribe = useCallback(
    (notify: () => void) => {
      const handleStorage = (event: StorageEvent) => {
        if (event.key === storageKey) {
          notify();
        }
      };
      const handleLocalChange = (event: Event) => {
        if ((event as CustomEvent<string>).detail === storageKey) {
          notify();
        }
      };

      window.addEventListener("storage", handleStorage);
      window.addEventListener(sessionDeckChangedEvent, handleLocalChange);
      return () => {
        window.removeEventListener("storage", handleStorage);
        window.removeEventListener(sessionDeckChangedEvent, handleLocalChange);
      };
    },
    [storageKey],
  );

  const getSnapshot = useCallback(
    () => JSON.stringify(readSessionDeck(window.localStorage, userId)),
    [userId],
  );
  const serializedSessionIds = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => emptySessionDeckSnapshot,
  );
  const sessionIds = useMemo(
    () => JSON.parse(serializedSessionIds) as string[],
    [serializedSessionIds],
  );

  const updateSessionDeck = useCallback(
    (update: (current: string[]) => string[]) => {
      const next = update(readSessionDeck(window.localStorage, userId));
      writeSessionDeck(window.localStorage, userId, next);
      window.dispatchEvent(
        new CustomEvent<string>(sessionDeckChangedEvent, {
          detail: storageKey,
        }),
      );
    },
    [storageKey, userId],
  );

  const rememberSession = useCallback(
    (sessionId: string) => {
      updateSessionDeck((current) => rememberSessionInDeck(current, sessionId));
    },
    [updateSessionDeck],
  );

  const dismissSession = useCallback(
    (sessionId: string) => {
      updateSessionDeck((current) =>
        dismissSessionFromDeck(current, sessionId),
      );
    },
    [updateSessionDeck],
  );

  const restoreSession = useCallback(
    (sessionId: string, index: number) => {
      updateSessionDeck((current) =>
        restoreSessionToDeck(current, sessionId, index),
      );
    },
    [updateSessionDeck],
  );

  const reorderSessions = useCallback(
    (sessionIds: string[]) => {
      updateSessionDeck((current) => reorderSessionDeck(current, sessionIds));
    },
    [updateSessionDeck],
  );

  return {
    dismissSession,
    rememberSession,
    reorderSessions,
    restoreSession,
    sessionIds,
  };
}
