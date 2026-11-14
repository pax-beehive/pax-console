"use client";

import { create } from "zustand";
import type { Region } from "@/features/region/bootstrap";

export type ConfigTab = "features" | "settings" | "audit";

// Only navigation preferences live here. Server snapshots stay in Query;
// editor drafts (especially write-only secrets) never enter persistent storage.
export const useConfigAdminStore = create<{
  region: Region;
  tab: ConfigTab;
  setRegion: (region: Region) => void;
  setTab: (tab: ConfigTab) => void;
}>((set) => ({
  region: "us",
  tab: "features",
  setRegion: (region) => set({ region }),
  setTab: (tab) => set({ tab }),
}));
