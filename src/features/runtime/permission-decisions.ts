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
  waitingTurn?: { sessionId: string; turnId: string },
) {
  const pending = new Map<string, PermissionRequestEvent>();
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
        waitingTurn &&
        request.sessionId === waitingTurn.sessionId &&
        request.turnId === waitingTurn.turnId &&
        request.approvalId
      ) {
        pending.set(key(request), request);
      }
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
    const id = key(request);
    const confirmed = pending.get(id);
    pending.delete(id);
    const decision = decisions.get(id);
    return confirmed || decision
      ? { ...request, ...confirmed, ...decision }
      : request;
  };
  const visible = events.map((event): SessionEvent => {
    if (event.type === "permission_request") return apply(event);
    if (event.type === "tool_call" && event.permissions?.length) {
      return { ...event, permissions: event.permissions.map(apply) };
    }
    return event;
  });
  // A transcript snapshot may predate the manager's unresolved approval.
  for (const [id, request] of pending) {
    if (decisions.has(id) || request.decision) continue;
    const index = visible.findIndex(
      (event) =>
        event.type === "tool_call" &&
        event.sessionId === request.sessionId &&
        event.turnId === request.turnId &&
        request.toolCallId !== undefined &&
        event.toolCallId === request.toolCallId,
    );
    const tool = visible[index];
    if (tool?.type === "tool_call") {
      visible[index] = {
        ...tool,
        permissions: [...(tool.permissions ?? []), request],
      };
    } else {
      visible.push(request);
    }
  }
  return visible;
}
