"use client";

import { useEffect, type RefObject } from "react";
import { turnNotificationId } from "./read-turns";

export function useReadTurnNotifications({
  userId,
  agentId,
  sessionId,
  targets,
  scrollRef,
}: {
  userId: string;
  agentId?: string;
  sessionId?: string;
  targets: Map<string, string>;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  // Unrelated live tokens must not recreate observers and rewrite read receipts.
  const targetKey = JSON.stringify([...targets]);
  useEffect(() => {
    const root = scrollRef.current;
    const entries: [string, string][] = JSON.parse(targetKey);
    if (
      !root ||
      !agentId ||
      !sessionId ||
      !entries.length ||
      !("serviceWorker" in navigator) ||
      typeof IntersectionObserver === "undefined" ||
      !crypto.subtle
    )
      return;
    let stopped = false;
    let observer: IntersectionObserver | undefined;
    const eligible = new Set(entries.map(([, turnId]) => turnId));
    const foreground = () =>
      document.visibilityState === "visible" && document.hasFocus();
    const publish = async (turnIds: string[]) => {
      try {
        const ids = await Promise.all(
          turnIds.map((turnId) =>
            turnNotificationId(userId, agentId, sessionId, turnId),
          ),
        );
        // Do not register a worker or request notification permission here.
        const registration = await navigator.serviceWorker.getRegistration("/");
        const worker = registration?.active;
        if (
          !stopped &&
          worker &&
          new URL(worker.scriptURL).pathname === "/push-sw.js"
        )
          worker.postMessage({ type: "pax:read-turn-notifications", ids });
      } catch {
        // Cleanup is best effort; refocus/re-entry retries and unread alerts stay visible.
      }
    };
    const observe = () => {
      observer?.disconnect();
      if (stopped || !foreground()) return;
      observer = new IntersectionObserver(
        (entries, source) => {
          if (stopped || source !== observer || !foreground()) return;
          const turns = new Set<string>();
          for (const entry of entries) {
            const turnId = (entry.target as HTMLElement).dataset
              .notificationReadTurn;
            if (
              entry.isIntersecting &&
              entry.intersectionRatio > 0 &&
              turnId &&
              eligible.has(turnId)
            )
              turns.add(turnId);
          }
          if (turns.size) void publish([...turns]);
        },
        { root },
      );
      for (const element of root.querySelectorAll(
        "[data-notification-read-turn]",
      ))
        observer.observe(element);
    };
    const blur = () => {
      observer?.disconnect();
      observer = undefined;
    };
    observe();
    window.addEventListener("focus", observe);
    window.addEventListener("pageshow", observe);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", observe);
    navigator.serviceWorker.addEventListener("controllerchange", observe);
    return () => {
      stopped = true;
      observer?.disconnect();
      window.removeEventListener("focus", observe);
      window.removeEventListener("pageshow", observe);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", observe);
      navigator.serviceWorker.removeEventListener("controllerchange", observe);
    };
  }, [userId, agentId, sessionId, targetKey, scrollRef]);
}
