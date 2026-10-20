export const subscriptionStates = [
  "enabled",
  "disabled",
  "revoked",
  "expired",
  "invalidated",
] as const;
export type SubscriptionStatus = (typeof subscriptionStates)[number];
export type PushReceiver = {
  receiver_id: string;
  user_id: string;
  email: string;
  device_label: string;
  channel: string;
  revision: number;
  status: SubscriptionStatus;
  permission: string;
  permission_reported_at: string;
  created_at: string;
  last_registered_at: string;
  expires_at?: string;
  latest_delivery: null | {
    status: string;
    attempted_at: string;
    attempts: number;
    provider_status?: number;
    error_category?: string;
    next_attempt_at?: string;
  };
};
export type SubscriptionSummary = Record<
  SubscriptionStatus | "total" | "enabled_users",
  number
>;
export type RegionalSubscriptions = {
  region: string;
  available: boolean;
  registration_enabled?: boolean;
  updated_at?: string;
  summary?: SubscriptionSummary;
  receivers?: PushReceiver[];
  next_cursor?: string;
  error?: string;
};
export type SubscriptionSnapshot = { regions: RegionalSubscriptions[] };
export type SubscriptionFilters = {
  search: string;
  status: string;
  channel: string;
  region: string;
  userId: string;
  cursors: Record<string, string>;
};

export function retainSubscriptionSnapshots(
  previous: SubscriptionSnapshot | undefined,
  incoming: SubscriptionSnapshot,
): SubscriptionSnapshot {
  return {
    regions: incoming.regions.map((source) =>
      source.available
        ? source
        : {
            ...previous?.regions.find((old) => old.region === source.region),
            ...source,
          },
    ),
  };
}

export function subscriptionSummary(sources: RegionalSubscriptions[]) {
  const snapshots = sources.filter((source) => source.summary);
  const total = {
    total: 0,
    enabled: 0,
    disabled: 0,
    revoked: 0,
    expired: 0,
    invalidated: 0,
    enabled_users: 0,
  };
  for (const source of snapshots) {
    for (const key of Object.keys(total) as (keyof SubscriptionSummary)[])
      total[key] += source.summary![key];
  }
  return {
    ...total,
    total: snapshots.length ? total.total : null,
    partial:
      sources.length === 0 ||
      sources.some((source) => !source.available || !source.summary),
  };
}
