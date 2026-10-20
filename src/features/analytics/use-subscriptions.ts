"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/features/api/client";
import { useFocusedQuery } from "./use-focused-query";
import {
  retainSubscriptionSnapshots,
  type SubscriptionFilters,
  type SubscriptionSnapshot,
} from "./subscription-data";

export function useSubscriptions(userId: string, filters: SubscriptionFilters) {
  const client = useQueryClient();
  const serialized = JSON.stringify(filters);
  const key = `push-subscriptions:${serialized}`;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const values = JSON.parse(serialized) as SubscriptionFilters;
      const query = new URLSearchParams({ limit: "25" });
      if (values.search) query.set("search", values.search);
      if (values.status) query.set("status", values.status);
      if (values.channel) query.set("channel", values.channel);
      if (values.userId) query.set("user_id", values.userId);
      if (values.region !== "all") query.set("region", values.region);
      for (const [region, cursor] of Object.entries(values.cursors))
        if (cursor) query.set(`after_${region}`, cursor);
      const incoming = await apiFetch<SubscriptionSnapshot>(
        `/api/v1/user/self/notification-subscriptions?${query}`,
        {
          signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        },
      );
      return retainSubscriptionSnapshots(
        client.getQueryData<SubscriptionSnapshot>(["focused", key, userId]),
        incoming,
      );
    },
    [client, serialized, key, userId],
  );
  return useFocusedQuery(key, userId, load);
}
