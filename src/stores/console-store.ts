"use client";

import { create } from "zustand";

type ConsoleStore = {
  activeNodeId?: string;
  activeAgentId?: string;
  activeSessionId?: string;
  sidebarCollapsed: boolean;
  sidebarExpandedGroups: Record<string, boolean>;
  contextDrawerOpen: boolean;
  composerDrafts: Record<string, string>;
  setActiveNode: (nodeId: string) => void;
  setActiveAgent: (agentId: string) => void;
  setActiveSession: (sessionId: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarGroup: (group: string) => void;
  setContextDrawerOpen: (open: boolean) => void;
  setComposerDraft: (sessionId: string, value: string) => void;
};

// Zustand is reserved for client-only UI state that should survive across
// sibling components. Server data stays in TanStack Query; do not duplicate
// nodes, agents, sessions, or messages in this store.
export const useConsoleStore = create<ConsoleStore>((set) => ({
  sidebarCollapsed: false,
  sidebarExpandedGroups: {},
  contextDrawerOpen: false,
  composerDrafts: {},
  setActiveNode: (activeNodeId) => set({ activeNodeId }),
  setActiveAgent: (activeAgentId) => set({ activeAgentId }),
  setActiveSession: (activeSessionId) => set({ activeSessionId }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebarGroup: (group) =>
    set((state) => ({
      sidebarExpandedGroups: {
        ...state.sidebarExpandedGroups,
        [group]: !(state.sidebarExpandedGroups[group] ?? true),
      },
    })),
  setContextDrawerOpen: (contextDrawerOpen) => set({ contextDrawerOpen }),
  setComposerDraft: (sessionId, value) =>
    set((state) => ({
      composerDrafts: {
        ...state.composerDrafts,
        [sessionId]: value,
      },
    })),
}));
