/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useConversationRun } from "./use-conversation-run";

describe("useConversationRun lifecycle", () => {
  it("marks a locally owned turn cancelled as soon as stop is acknowledged", () => {
    const { result } = renderHook(() =>
      useConversationRun({
        agentId: "agent_1",
        nodeId: "node_1",
        sessionId: "sess_1",
        userId: "user_1",
      }),
    );

    act(() => result.current.markCancelled());

    expect(result.current.status).toBe("cancelled");
  });
});
