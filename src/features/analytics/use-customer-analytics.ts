"use client";
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/features/api/client";
import {
  retainRegionalSnapshots,
  type CustomerSnapshot,
} from "./customer-data";
import { useFocusedQuery } from "./use-focused-query";

export function useCustomerAnalytics(userId: string) {
  const client = useQueryClient();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const next = await apiFetch<CustomerSnapshot>(
        "/api/v1/user/self/customer-analytics",
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        },
      );
      return retainRegionalSnapshots(
        client.getQueryData<CustomerSnapshot>(["focused", "customers", userId]),
        next,
      );
    },
    [client, userId],
  );
  return useFocusedQuery("customers", userId, load);
}

const recordVisit = (signal: AbortSignal) =>
  apiFetch<{ recorded: boolean }>("/api/v1/user/self/customer-visit", {
    method: "POST",
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
  });

export function CustomerVisitTracker({ userId }: { userId: string }) {
  useFocusedQuery("customer-visit", userId, recordVisit, 60_000);
  return null;
}
