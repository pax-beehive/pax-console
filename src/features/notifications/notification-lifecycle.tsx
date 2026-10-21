"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/features/api/client";
import { registerSignOutCleanup } from "@/features/api/logout-cleanup";
import {
  notificationBase,
  pushBindingKey,
  PushClient,
  pushSupported,
  readPushBinding,
  type PushConfig,
} from "./push-client";

export function NotificationLifecycle({ userId }: { userId: string }) {
  if (!pushSupported()) return null;
  return <SupportedNotificationLifecycle userId={userId} />;
}
function SupportedNotificationLifecycle({ userId }: { userId: string }) {
  const queries = useQueryClient();
  useEffect(() => {
    if (!pushSupported()) return;
    const client = new PushClient(userId);
    const unregister = registerSignOutCleanup(() => client.disable());
    let stopped = false;
    let running = false;
    let lastAttempt = 0;
    const repair = async () => {
      if (
        stopped ||
        running ||
        !navigator.onLine ||
        document.visibilityState === "hidden" ||
        !document.hasFocus() ||
        !readPushBinding() ||
        Date.now() - lastAttempt < 60_000
      )
        return;
      running = true;
      lastAttempt = Date.now();
      try {
        const config = await apiFetch<PushConfig>(`${notificationBase}/config`);
        if (!stopped) {
          await client.reconcile(config);
          await queries.invalidateQueries({
            queryKey: ["notification-receivers", userId],
          });
        }
      } catch {
        /* Settings exposes failures and provides an explicit retry. */
      } finally {
        running = false;
      }
    };
    const changed = (event: MessageEvent | StorageEvent) => {
      if (stopped) return;
      if (
        event.type === "storage" &&
        (event as StorageEvent).key !== pushBindingKey &&
        (event as StorageEvent).key !== null
      )
        return;
      void queries.invalidateQueries({
        queryKey: ["notification-receivers", userId],
      });
      if (
        event.type === "message" &&
        (event as MessageEvent).data?.type === "pax:push-subscription-changed"
      ) {
        lastAttempt = 0;
        void repair();
      }
    };
    void repair();
    window.addEventListener("focus", repair);
    window.addEventListener("online", repair);
    window.addEventListener("storage", changed);
    document.addEventListener("visibilitychange", repair);
    navigator.serviceWorker.addEventListener("message", changed);
    return () => {
      stopped = true;
      unregister();
      window.removeEventListener("focus", repair);
      window.removeEventListener("online", repair);
      window.removeEventListener("storage", changed);
      document.removeEventListener("visibilitychange", repair);
      navigator.serviceWorker.removeEventListener("message", changed);
    };
  }, [userId, queries]);
  return null;
}
