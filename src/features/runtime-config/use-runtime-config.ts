"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { Region } from "@/features/region/bootstrap";
import { getConfig, getConfigAudit } from "./api";

export const configKeys = {
  snapshot: (userId: string, region: Region) =>
    ["runtime-config", userId, region] as const,
  audit: (userId: string, region: Region, key?: string) =>
    ["runtime-config-audit", userId, region, key ?? ""] as const,
};

/** Regional snapshots contain only Manager-approved display values. */
export function useRuntimeConfig(userId: string, region: Region) {
  return useQuery({
    queryKey: configKeys.snapshot(userId, region),
    queryFn: ({ signal }) => getConfig(region, signal),
    enabled: Boolean(userId),
    staleTime: 15_000,
    retry: false,
  });
}

export function useConfigAudit(
  userId: string,
  region: Region,
  key?: string,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: configKeys.audit(userId, region, key),
    queryFn: ({ signal, pageParam }) =>
      getConfigAudit(region, { key, cursor: pageParam, limit: 50 }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    enabled: Boolean(userId) && enabled,
    staleTime: 15_000,
    retry: false,
  });
}
