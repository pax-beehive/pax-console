"use client";

import { create } from "zustand";

type ArtifactPreviewStore = {
  activeByScope: Record<string, string>;
  activate: (scope: string, viewerId: string) => void;
  release: (scope: string, viewerId: string) => void;
};

// Only sibling-viewer selection belongs here. Content and signed URLs stay
// inside their viewer and are released when it closes or unmounts.
export const useArtifactPreviewStore = create<ArtifactPreviewStore>((set) => ({
  activeByScope: {},
  activate: (scope, viewerId) =>
    set((state) => ({
      activeByScope: { ...state.activeByScope, [scope]: viewerId },
    })),
  release: (scope, viewerId) =>
    set((state) => {
      if (state.activeByScope[scope] !== viewerId) {
        return state;
      }
      const activeByScope = { ...state.activeByScope };
      delete activeByScope[scope];
      return { activeByScope };
    }),
}));
