"use client";

import { useEffect, useState } from "react";
import type { SessionDisplayStatus } from "@/features/runtime/session-display-status";
import type { WorkstreamItem } from "@/features/runtime/session-events";
import { showPendingActivity } from "./activity-label";
import { AgentPendingIndicator } from "./session-event-cards";

export function SessionPendingActivity({
  status,
  items,
  scopeKey,
}: {
  status: SessionDisplayStatus;
  items: readonly WorkstreamItem[];
  scopeKey: string;
}) {
  if (!showPendingActivity(status, items)) return null;
  const last = items.at(-1);
  // Before the first output, acknowledge the pending send immediately.
  if (!last || (last.type === "event" && last.event.type === "user_message")) {
    return <AgentPendingIndicator />;
  }
  const reply = items.findLast(
    (item) => item.type === "event" && item.event.type === "agent_message",
  );
  const content =
    reply?.type === "event" && reply.event.type === "agent_message"
      ? reply.event.content
      : "";
  // Content identity survives history polling but changes on every text delta.
  // Remount only this tiny timer; the transcript and composer are never delayed.
  return (
    <OutputGapIndicator
      key={JSON.stringify([scopeKey, last.id, reply?.id, content])}
    />
  );
}

function OutputGapIndicator() {
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setQuiet(true), 1500);
    return () => window.clearTimeout(timer);
  }, []);
  return quiet ? <AgentPendingIndicator /> : null;
}
