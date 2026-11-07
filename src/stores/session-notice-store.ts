"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type SessionNoticeStore = {
  dismissed: Record<string, boolean>;
  dismiss: (key: string) => void;
};

export function externalSessionNoticeKey(
  userId: string,
  agentId: string,
  sessionId: string,
) {
  return JSON.stringify([userId, agentId, sessionId]);
}

// Store only local presentation choices, never session metadata or messages.
export const useSessionNoticeStore = create<SessionNoticeStore>()(
  persist(
    (set) => ({
      dismissed: {},
      dismiss: (key) =>
        set((state) => ({ dismissed: { ...state.dismissed, [key]: true } })),
    }),
    {
      name: "pax-console:external-session-notices",
      storage: createJSONStorage(() => ({
        getItem: (key) => {
          try {
            return window.localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem: (key, value) => {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // Dismissal still works in memory when browser storage is blocked.
          }
        },
        removeItem: (key) => {
          try {
            window.localStorage.removeItem(key);
          } catch {
            // Browser storage may be unavailable.
          }
        },
      })),
      partialize: (state) => ({ dismissed: state.dismissed }),
    },
  ),
);
