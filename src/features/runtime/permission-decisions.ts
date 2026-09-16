import type {
  PermissionDecision,
  PermissionRequestEvent,
  SessionEvent,
} from "./session-events";

// Requests may already be nested in tool cards when another source delivers
// their response. Keep decision reconciliation independent of card placement.
export function reconcilePermissionDecisions(
  events: SessionEvent[],
  sources: SessionEvent[] = events,
) {
  const decisions = new Map<
    string,
    { decision: PermissionDecision; decidedAt?: string }
  >();
  const key = (event: {
    sessionId: string;
    turnId?: string;
    requestId: string;
  }) => JSON.stringify([event.sessionId, event.turnId ?? "", event.requestId]);
  for (const event of sources) {
    if (event.type === "permission_decision") {
      decisions.set(key(event), {
        decision: event.decision,
        decidedAt: event.createdAt,
      });
    }
    const requests =
      event.type === "tool_call"
        ? (event.permissions ?? [])
        : event.type === "permission_request"
          ? [event]
          : [];
    for (const request of requests) {
      if (
        request.decision &&
        request.decision.decisionOption !== "auto_approved"
      ) {
        decisions.set(key(request), {
          decision: request.decision,
          decidedAt: request.decidedAt,
        });
      }
    }
  }
  const apply = (request: PermissionRequestEvent) => {
    const result = decisions.get(key(request));
    return result ? { ...request, ...result } : request;
  };
  return events.map((event): SessionEvent => {
    if (event.type === "permission_request") return apply(event);
    if (event.type === "tool_call" && event.permissions?.length) {
      return { ...event, permissions: event.permissions.map(apply) };
    }
    return event;
  });
}
