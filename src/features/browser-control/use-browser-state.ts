"use client";

import { useQuery } from "@tanstack/react-query";
import { browserControl, BrowserState } from "./api";

export function useBrowserState(userId: string, nodeId: string) {
  return useQuery({
    queryKey: ["user", userId, "node", nodeId, "browser-control"],
    queryFn: () => browserControl<BrowserState>(userId, nodeId, "state"),
    retry: false,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    gcTime: 0,
  });
}
