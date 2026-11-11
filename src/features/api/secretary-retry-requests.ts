"use client";

import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";

type RetryRequests = {
  pending: Record<string, string>;
  acquire: (owner: string) => string;
  acknowledge: (owner: string, requestId: string) => void;
};

// Persist only unacknowledged identities, never task or conversation content.
export const secretaryRetryRequests = createStore<RetryRequests>()(
  persist(
    (set, get) => ({
      pending: {},
      acquire: (owner) => {
        const current = get().pending;
        if (Object.hasOwn(current, owner)) return current[owner];
        const requestId = crypto.randomUUID();
        set({ pending: { ...current, [owner]: requestId } });
        return requestId;
      },
      acknowledge: (owner, requestId) => {
        if (get().pending[owner] !== requestId) return;
        const pending = { ...get().pending };
        delete pending[owner];
        set({ pending });
      },
    }),
    {
      name: "pax:secretary-retry-requests:v1",
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return sessionStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            sessionStorage.setItem(name, value);
          } catch {
            // Keep the in-memory identity if browser storage is unavailable.
          }
        },
        removeItem: (name) => {
          try {
            sessionStorage.removeItem(name);
          } catch {
            // Acknowledgement must not turn into a failed server request.
          }
        },
      })),
      partialize: ({ pending }) => ({ pending }),
    },
  ),
);
