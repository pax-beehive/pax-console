"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsBack, SettingsPageHeader } from "./settings-navigation";
import { useDesktopSettings } from "./use-desktop-settings";
import { settingsSection } from "./settings-catalog";
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

type DeviceConfirmation = {
  client: PushClient;
  config: PushConfig;
  updatedAt: number;
  state: PushState | null;
};

export function NotificationSettings({ userId }: { userId: string }) {
  const desktop = useDesktopSettings();
  const queries = useQueryClient();
  const client = useMemo(() => new PushClient(userId), [userId]);
  const supported = useSyncExternalStore(
    () => () => {},
    pushSupported,
    () => false,
  );
  const [confirmation, setConfirmation] = useState<DeviceConfirmation | null>(
    null,
  );
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
    const checkedConfig = config.data;
    const updatedAt = config.dataUpdatedAt;
    let active = true;
    client
      .reconcile(checkedConfig)
      .then(async (value) => {
        if (!active) return;
        if (value === "enabled") {
          await queries.invalidateQueries({
            queryKey: ["notification-receivers", userId],
          });
        }
        if (active) {
          setConfirmation({
            client,
            config: checkedConfig,
            updatedAt,
            state: value,
          });
          setError("");
        }
      })
      .catch(() => {
        if (active) {
          setConfirmation({
            client,
            config: checkedConfig,
            updatedAt,
            state: null,
          });
          setError(
            "Could not confirm this device's subscription. Retry when you are online.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [client, config.data, config.dataUpdatedAt, queries, supported, userId]);
  const current =
    confirmation?.client === client &&
    confirmation.config === config.data &&
    confirmation.updatedAt === config.dataUpdatedAt
      ? confirmation
      : null;
  const state = current?.state ?? null;
  const binding = supported ? readPushBinding() : null;
  const owned = binding?.owner === userId ? binding : null;
  const receiver = receivers.data?.regions
    .flatMap((region) => region.receivers ?? [])
    .find((row) => row.receiver_id === owned?.receiver_id);
  const enabled =
    state === "enabled" && receiver?.status === "enabled" && owned?.enabled;
  const checking = supported && Boolean(config.data) && !current;
  const loading =
    supported && (config.isLoading || receivers.isLoading || checking);
  const refreshing = config.isFetching || receivers.isFetching;
  const unavailable =
    config.isError || receivers.isError || current?.state === null;
  const refresh = async () => {
    await Promise.all([config.refetch(), receivers.refetch()]);
  };
  const act = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await action();
      if (typeof result === "string" && config.data)
        setConfirmation({
          client,
          config: config.data,
          updatedAt: config.dataUpdatedAt,
          state: result as PushState,
        });
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="hidden lg:block">
        <SettingsPageHeader
          title="Notifications"
          category="Workspace"
          description={settingsSection("notifications").description}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 lg:px-8 lg:py-6">
        <div className="mx-auto w-full max-w-2xl lg:max-w-5xl">
          <div className="grid gap-5 lg:max-w-3xl">
            <header className="lg:hidden">
              <SettingsBack />
              <h1 className="text-2xl font-semibold">Notifications</h1>
              <p className="mt-2 text-sm text-ink-tertiary">
                Manage push notifications for this browser or Android app. Each
                device is enabled separately.
              </p>
            </header>
            <section className="grid gap-4 rounded-xl border border-hairline bg-surface-1 p-5 lg:p-6">
              <h2 className="flex items-center gap-2 font-medium">
                <Bell className="h-4 w-4" />
                This device
              </h2>
              <p className="-mt-2 hidden text-sm leading-6 text-ink-tertiary lg:block">
                Control alerts for this browser or Android app. Enabling another
                device is a separate choice.
              </p>
              <p role="status" className="text-sm text-ink-muted">
                {loading
                  ? "Checking notifications..."
                  : unavailable
                    ? "Notification status is temporarily unavailable."
                    : state === "enabled" && !enabled
                      ? "Confirming this device's server registration..."
                      : !supported
                        ? descriptions.unsupported
                        : state
                          ? descriptions[state]
                          : "Checking notifications..."}
              </p>
              {!desktop && (
                <>
                  {!loading &&
                    config.data &&
                    !config.data.turn_completion_enabled && (
                      <p className="text-sm text-ink-tertiary">
                        You can enable this device and send a test notification.
                        Automatic turn alerts are not available yet.
                      </p>
                    )}
                  {!loading && config.data?.turn_completion_enabled && (
                    <p className="text-sm text-ink-tertiary">
                      Automatic notifications are enabled for standard sessions.
                      Notifications include a short reply preview; tap one to
                      open its session. Encrypted sessions are not supported
                      yet.
                    </p>
                  )}
                  {!loading && config.data?.approval_required_enabled && (
                    <p className="text-sm text-ink-tertiary">
                      Get notified when a session needs your approval. Tap a
                      notification to open the session and review the request.
                      Requests handled by Pax Auto Approve or a saved approval
                      do not trigger notifications.
                    </p>
                  )}
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {supported &&
                  state !== null &&
                  state !== "enabled" &&
                  state !== "unsupported" && (
                    <Button
                      variant="primary"
                      disabled={
                        busy ||
                        loading ||
                        refreshing ||
                        unavailable ||
                        !config.data?.enabled ||
                        !config.data?.test_enabled ||
                        state === "denied"
                      }
                      onClick={() => {
                        if (config.data)
                          void act(() => client.enable(config.data!));
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
            {desktop && !loading && config.data && (
              <section aria-labelledby="notification-events-title">
                <h2
                  id="notification-events-title"
                  className="text-base font-medium"
                >
                  When notifications arrive
                </h2>
                <p className="mt-1 text-sm leading-6 text-ink-tertiary">
                  Alerts bring you back to the session that needs your
                  attention.
                </p>
                <div className="mt-4 divide-y divide-hairline border-y border-hairline">
                  {config.data.turn_completion_enabled && (
                    <div className="grid gap-2 py-5 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-6">
                      <h3 className="text-sm font-medium text-ink-muted">
                        Completed replies
                      </h3>
                      <p className="text-sm leading-6 text-ink-tertiary">
                        Automatic notifications are enabled for standard
                        sessions. Notifications include a short reply preview;
                        tap one to open its session. Encrypted sessions are not
                        supported yet.
                      </p>
                    </div>
                  )}
                  {config.data.approval_required_enabled && (
                    <div className="grid gap-2 py-5 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-6">
                      <h3 className="text-sm font-medium text-ink-muted">
                        Approval requests
                      </h3>
                      <p className="text-sm leading-6 text-ink-tertiary">
                        Get notified when a session needs your approval. Tap a
                        notification to open the session and review the request.
                        Requests handled by Pax Auto Approve or a saved approval
                        do not trigger notifications.
                      </p>
                    </div>
                  )}
                  {!config.data.turn_completion_enabled && (
                    <p className="py-5 text-sm leading-6 text-ink-tertiary">
                      You can enable this device and send a test notification.
                      Automatic turn alerts are not available yet.
                    </p>
                  )}
                </div>
              </section>
            )}
            <p className="text-sm leading-6 text-ink-tertiary lg:text-xs lg:leading-5">
              System and browser settings control whether notifications appear.
              {!desktop && (
                <>
                  {" "}
                  Completed turn notifications include a short reply preview.
                  Approval reminders contain no request details.
                </>
              )}{" "}
              Signing out removes this browser&apos;s subscription.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
