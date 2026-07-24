import { describe, expect, it } from "vitest";
import { sessionDisplayStatus } from "./session-display-status";

describe("sessionDisplayStatus", () => {
  it("shows a remotely observed turn as streaming", () => {
    expect(
      sessionDisplayStatus({
        conversationStatus: "idle",
        observerStatus: "observing",
        reportedStatus: "idle",
        remoteTurnActive: false,
      }),
    ).toBe("streaming");
  });

  it("restores running state from session metadata before events arrive", () => {
    expect(
      sessionDisplayStatus({
        conversationStatus: "idle",
        observerStatus: "idle",
        reportedStatus: "running",
        remoteTurnActive: true,
      }),
    ).toBe("streaming");
  });

  it("restores approval state from session metadata", () => {
    expect(
      sessionDisplayStatus({
        conversationStatus: "idle",
        observerStatus: "idle",
        reportedStatus: "waiting_approval",
        remoteTurnActive: true,
      }),
    ).toBe("waiting_approval");
  });

  it("keeps a locally completed turn done while metadata catches up", () => {
    expect(
      sessionDisplayStatus({
        conversationStatus: "done",
        observerStatus: "idle",
        reportedStatus: "running",
        remoteTurnActive: true,
      }),
    ).toBe("done");
  });

  it("surfaces observer failures", () => {
    expect(
      sessionDisplayStatus({
        conversationStatus: "idle",
        observerStatus: "error",
        reportedStatus: "running",
        remoteTurnActive: true,
      }),
    ).toBe("error");
  });

  it("returns to streaming when the observer resumes after an idle timeout", () => {
    expect(
      sessionDisplayStatus({
        conversationError: new Error(
          "ACP request idle timed out: session/prompt",
        ),
        conversationStatus: "error",
        observerStatus: "observing",
        reportedStatus: "running",
        remoteTurnActive: true,
      }),
    ).toBe("streaming");
  });

  it("returns to streaming when the observer recovers a network TypeError", () => {
    const networkError = new TypeError("Failed to fetch");

    expect(
      sessionDisplayStatus({
        conversationError: networkError,
        conversationStatus: "error",
        observerStatus: "observing",
        reportedStatus: "running",
        remoteTurnActive: true,
      }),
    ).toBe("streaming");
  });

  it("does not hide a non-timeout conversation error when observing resumes", () => {
    expect(
      sessionDisplayStatus({
        conversationError: new Error("ACP request failed"),
        conversationStatus: "error",
        observerStatus: "observing",
        reportedStatus: "running",
        remoteTurnActive: true,
      }),
    ).toBe("error");
  });

  it("keeps approval visible when its observer times out", () => {
    expect(
      sessionDisplayStatus({
        conversationStatus: "idle",
        observerStatus: "error",
        reportedStatus: "waiting_approval",
        remoteTurnActive: true,
      }),
    ).toBe("waiting_approval");
  });

  it("does not show approval for an auto-approve session", () => {
    expect(
      sessionDisplayStatus({
        autoApprove: true,
        conversationStatus: "waiting_approval",
        observerStatus: "idle",
        reportedStatus: "waiting_approval",
        remoteTurnActive: true,
      }),
    ).toBe("streaming");
  });
});
