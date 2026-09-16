import { describe, expect, it } from "vitest";
import { mergeEvents } from "./merge-session-events";
import { reconcileSessionTimeline } from "./reconcile-session-timeline";
import { normalizeHistoryMessage } from "./normalize-history-message";
import type { PermissionRequestEvent, SessionEvent } from "./session-events";

const request: PermissionRequestEvent = {
  type: "permission_request",
  id: "request",
  requestId: "rpc-1",
  approvalId: "approval-1",
  sessionId: "session-1",
  turnId: "turn-1",
  toolCallId: "tool-1",
  title: "Run command",
  options: [],
  createdAt: "2026-09-15T00:00:00Z",
};
const tool: SessionEvent = {
  type: "tool_call",
  id: "tool",
  toolCallId: "tool-1",
  name: "Run command",
  sessionId: request.sessionId,
  turnId: request.turnId,
  status: "called",
  createdAt: request.createdAt,
};
const response: SessionEvent = {
  type: "permission_decision",
  id: "response",
  requestId: request.requestId,
  sessionId: request.sessionId,
  turnId: request.turnId,
  createdAt: "2026-09-15T00:00:01Z",
  decision: {
    decisionOption: "allow_once",
    status: "approved",
    source: "user",
  },
};

function nestedRequest(events: SessionEvent[]) {
  const event = events.find((item) => item.type === "tool_call");
  return event?.type === "tool_call" ? event.permissions?.[0] : undefined;
}

describe("permission decisions", () => {
  it("recovers the stored response into a live tool card without an approval API fallback", () => {
    const storedResponse = normalizeHistoryMessage({
      message_id: "stored-response",
      session_id: request.sessionId,
      turn_id: request.turnId,
      message_type: "permission_response",
      role: "user",
      created_at: response.createdAt,
      raw_json: {
        jsonrpc: "2.0",
        id: request.requestId,
        decided_by_user_id: "user-1",
        result: { outcome: { outcome: "selected", optionId: "allow_once" } },
      },
    });
    expect(storedResponse[0]).toMatchObject({
      type: "permission_decision",
      decision: response.decision,
    });
    const history = mergeEvents([tool, request, ...storedResponse]);
    expect(
      nestedRequest(reconcileSessionTimeline(history, []).timeline)?.decision,
    ).toEqual(response.decision);
    const live = mergeEvents([tool, request]);
    expect(
      nestedRequest(reconcileSessionTimeline(history, live).timeline)?.decision,
    ).toEqual(response.decision);
  });

  it("applies a later response to a request already embedded in a tool card", () => {
    const previous = mergeEvents([tool, request]);
    expect(previous).toHaveLength(1);
    const result = mergeEvents([...previous, response]);
    expect(nestedRequest(result)?.decision).toEqual(response.decision);
  });

  it("preserves durable decisions while live conversation owns the active turn", () => {
    const history = mergeEvents([tool, request, response]);
    const conversation = mergeEvents([tool, request]);
    const result = reconcileSessionTimeline(history, conversation);
    expect(nestedRequest(result.timeline)?.decision).toEqual(response.decision);
  });

  it("does not reuse a native request ID decision in another turn or session", () => {
    for (const scope of [{ turnId: "turn-2" }, { sessionId: "session-2" }]) {
      const result = mergeEvents([
        ...mergeEvents([
          { ...tool, ...scope },
          { ...request, ...scope },
        ]),
        response,
      ]);
      expect(nestedRequest(result)?.decision).toBeUndefined();
    }
  });
});
