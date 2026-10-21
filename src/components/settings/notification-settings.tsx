"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsBack } from "./settings-navigation";
import { apiFetch } from "@/features/api/client";
import type { SubscriptionSnapshot } from "@/features/analytics/subscription-data";
import {
  notificationBase,
  PushClient,
  pushSupported,
  readPushBinding,
  type PushConfig,
  type PushState,
} from "@/features/notifications/push-client";

const descriptions: Record<PushState, string> = {
  unsupported:
    "This browser does not support push notifications. On iPhone or iPad, add PAX to the Home Screen and open it there.",
  unconfigured:
    "Notifications are not configured on the server yet. Contact your administrator.",
  off: "Notifications are off on this device.",
  default:
    "Permission was not granted. Select Enable notifications to try again.",
  denied:
    "Notifications are blocked. Allow notifications in your browser and Android app or system settings, then retry.",
  enabled: "Notifications are enabled on this device.",
};

export function NotificationSettings({ userId }: { userId: string }) {
  const queries = useQueryClient();
  const client = useMemo(() => new PushClient(userId), [userId]);
  const supported = useSyncExternalStore(
    () => () => {},
    pushSupported,
    () => false,
  );
  const [state, setState] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const config = useQuery({
    queryKey: ["notification-config", userId],
    queryFn: () => apiFetch<PushConfig>(`${notificationBase}/config`),
    retry: false,
    enabled: supported,
  });
  const receivers = useQuery({
    queryKey: ["notification-receivers", userId],
    queryFn: () =>
      apiFetch<SubscriptionSnapshot>(`${notificationBase}/receivers`),
    retry: false,
    enabled: supported,
  });
  useEffect(() => {
    if (!supported || !config.data) return;
    let active = true;
    client
      .reconcile(config.data)
      .then((value) => {
        if (active) {
          setState(value);
          setError("");
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Could not confirm this device's subscription. Retry when you are online.",
          );
      });
    return () => {
      active = false;
    };
  }, [client, config.data, config.dataUpdatedAt, supported]);
  const binding = supported ? readPushBinding() : null;
  const owned = binding?.owner === userId ? binding : null;
  const receiver = receivers.data?.regions
    .flatMap((region) => region.receivers ?? [])
    .find((row) => row.receiver_id === owned?.receiver_id);
  const enabled =
    state === "enabled" && receiver?.status === "enabled" && owned?.enabled;
  const loading = supported && (config.isLoading || receivers.isLoading);
  const unavailable = config.isError || receivers.isError;
  const refresh = async () => {
    await Promise.all([config.refetch(), receivers.refetch()]);
  };
  const act = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (typeof result === "string") setState(result as PushState);
      if (success) setNotice(success);
      await queries.invalidateQueries({
        queryKey: ["notification-receivers", userId],
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not update notifications. Retry when you are online.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      <div className="mx-auto grid max-w-2xl gap-5">
        <header>
          <SettingsBack />
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="mt-2 text-sm text-ink-tertiary">
            Manage push notifications for this browser or Android app. Each
            device is enabled separately.
          </p>
        </header>
        <section className="grid gap-4 rounded-xl border border-hairline bg-surface-1 p-5">
          <h2 className="flex items-center gap-2 font-medium">
            <Bell className="h-4 w-4" />
            This device
          </h2>
          <p role="status" className="text-sm text-ink-muted">
            {loading
              ? "Checking notifications..."
              : unavailable
                ? "Notification status is temporarily unavailable."
                : state === "enabled" && !enabled
                  ? "Confirming this device's server registration..."
                  : descriptions[supported ? state : "unsupported"]}
          </p>
          {!loading && config.data && !config.data.turn_completion_enabled && (
            <p className="text-sm text-ink-tertiary">
              You can enable this device and send a test notification. Automatic
              turn alerts are not available yet.
            </p>
          )}
          {!loading && config.data?.turn_completion_enabled && (
            <p className="text-sm text-ink-tertiary">
              Automatic notifications are enabled for standard sessions.
              Encrypted sessions are not supported yet.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!enabled && supported && (
              <Button
                variant="primary"
                disabled={
                  busy ||
                  loading ||
                  unavailable ||
                  !config.data?.enabled ||
                  !config.data?.test_enabled ||
                  state === "denied"
                }
                onClick={() => {
                  if (config.data) void act(() => client.enable(config.data!));
                }}
              >
                Enable notifications
              </Button>
            )}
            {owned && (
              <Button
                disabled={busy}
                onClick={() => void act(() => client.disable())}
              >
                Turn off on this device
              </Button>
            )}
            {enabled && (
              <Button
                disabled={busy || unavailable || !config.data?.test_enabled}
                onClick={() =>
                  void act(
                    () => client.test(),
                    "Test notification queued. Check this device's notifications. You can retry after 30 seconds.",
                  )
                }
              >
                Send test notification
              </Button>
            )}
            {supported && (
              <Button
                icon={<RefreshCw className="h-4 w-4" />}
                disabled={busy || loading}
                onClick={() => void refresh()}
              >
                Refresh status
              </Button>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-warning">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-ink-muted">
              {notice}
            </p>
          )}
          {receiver?.latest_delivery && (
            <p className="text-xs text-ink-tertiary">
              Latest attempt:{" "}
              {receiver.latest_delivery.status === "accepted"
                ? "Accepted by push service; device display is not confirmed."
                : receiver.latest_delivery.status === "pending" &&
                    receiver.latest_delivery.attempts === 0
                  ? "Queued; waiting for an attempt."
                  : receiver.latest_delivery.status}
              {receiver.latest_delivery.error_category
                ? ` (${receiver.latest_delivery.error_category})`
                : ""}
            </p>
          )}
        </section>
        <p className="text-sm leading-6 text-ink-tertiary">
          System and browser settings control whether notifications appear.
          Notification text contains no conversation content. Signing out
          removes this browser&apos;s subscription.
        </p>
      </div>
    </div>
  );
}
