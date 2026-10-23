"use client";

import { create } from "zustand";

export type LocalFileFetchRecord = {
  publicationId: string;
  fetchedAt: string;
};

type LocalFileFetchStore = {
  /** `${userId}:${sessionId}` -> absolute path -> latest accepted fetch. */
  fetched: Record<string, Record<string, LocalFileFetchRecord>>;
  recordFetch: (
    scope: string,
    path: string,
    record: LocalFileFetchRecord,
  ) => void;
  forgetFetch: (scope: string, path: string) => void;
};

export function localFileFetchScope(userId: string, sessionId: string) {
  return `${userId}:${sessionId}`;
}

// Client-only memory of which local paths this tab already fetched in a
// session, so the dialog can offer the existing publication instead of
// uploading again. Publication state itself stays in TanStack Query.
export const useLocalFileFetchStore = create<LocalFileFetchStore>((set) => ({
  fetched: {},
  recordFetch: (scope, path, record) =>
    set((state) => ({
      fetched: {
        ...state.fetched,
        [scope]: { ...state.fetched[scope], [path]: record },
      },
    })),
  forgetFetch: (scope, path) =>
    set((state) => {
      const current = state.fetched[scope];
      if (!current?.[path]) {
        return state;
      }
      const next = { ...current };
      delete next[path];
      return { fetched: { ...state.fetched, [scope]: next } };
    }),
}));
