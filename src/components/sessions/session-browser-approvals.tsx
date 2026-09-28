"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import { MonoId } from "@/components/ui/text";
import { browserControl } from "@/features/browser-control/api";
import { useBrowserState } from "@/features/browser-control/use-browser-state";

export function SessionBrowserApprovals({
  userId,
  nodeId,
}: {
  userId: string;
  nodeId: string;
}) {
  const query = useBrowserState(userId, nodeId);
  const [pendingDecision, setPendingDecision] = useState<{
    id: string;
    decision: "allow" | "deny";
  }>();
  const busy = Boolean(pendingDecision);
  const busyRef = useRef(false);
  const [error, setError] = useState<Error>();
  const [resolved, setResolved] = useState<string[]>([]);
  const requests =
    query.data?.pending.filter(
      (request) =>
        request.decision === "pending" && !resolved.includes(request.id),
    ) ?? [];

  async function decide(id: string, decision: "allow" | "deny") {
    if (busyRef.current) return;
    busyRef.current = true;
    setPendingDecision({ id, decision });
    setError(undefined);
    try {
      await browserControl(userId, nodeId, "decide", {
        id,
        decision,
        scope: "session",
      });
      setResolved((previous) => [...previous, id]);
      void query.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      busyRef.current = false;
      setPendingDecision(undefined);
    }
  }

  // Nodes without a browser runtime should not display a persistent error.
  // Retain known requests on polling failures, but never present them as fresh.
  if (!requests.length && !error) return null;
  return (
    <section
      aria-label="Browser approval requests"
      className="max-h-48 shrink-0 overflow-auto border-b border-hairline bg-surface px-3 py-2 sm:px-4"
    >
      <h3 className="text-sm font-medium" aria-live="polite">
        Browser approval requests ({requests.length})
      </h3>
      <p className="text-xs text-ink-muted">
        Requests from browsers on this node. Allow applies only to the
        requesting browser session.
      </p>
      {query.error && <InlineError error={query.error} />}
      {error && <InlineError error={error} />}
      {requests.map((request) => (
        <div
          key={request.id}
          className="flex flex-wrap items-center gap-2 py-2 text-xs"
        >
          <span className="min-w-0 break-all">{request.origin}</span>
          <span className="flex items-center gap-1">
            Browser <MonoId>{request.session}</MonoId>
          </span>
          <Button
            disabled={busy || query.data?.policy.paused}
            onClick={() => void decide(request.id, "allow")}
          >
            {pendingDecision?.id === request.id &&
            pendingDecision.decision === "allow"
              ? "Allowing…"
              : "Allow browser session"}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void decide(request.id, "deny")}
          >
            {pendingDecision?.id === request.id &&
            pendingDecision.decision === "deny"
              ? "Denying…"
              : "Deny"}
          </Button>
          {pendingDecision?.id === request.id && (
            <span role="status" className="text-ink-muted">
              Sending your decision…
            </span>
          )}
        </div>
      ))}
      {query.data?.policy.paused && (
        <p className="text-xs text-ink-muted">
          Browser control is paused. Resume it in node settings before allowing
          access.
        </p>
      )}
    </section>
  );
}
