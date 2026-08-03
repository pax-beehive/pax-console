import { describe, expect, it } from "vitest";
import { sessionDisplayStatus } from "./session-display-status";

describe("sessionDisplayStatus", () => {
  it.each([
    ["idle", "idle"],
    ["running", "streaming"],
    ["waiting_approval", "waiting_approval"],
  ] as const)("maps canonical runtime status %s to %s", (runtime, display) => {
    expect(sessionDisplayStatus(runtime)).toBe(display);
  });

  it("fails closed to idle when canonical runtime status is unavailable", () => {
    expect(sessionDisplayStatus(undefined)).toBe("idle");
  });

  it("does not present an invalid canonical runtime status", () => {
    expect(sessionDisplayStatus("done")).toBe("idle");
  });

  describe("when this client owns the submitted turn", () => {
    it("shows running immediately while the canonical snapshot is still idle", () => {
      expect(
        sessionDisplayStatus("idle", {
          ownedConversationStatus: "streaming",
        }),
      ).toBe("streaming");
    });

    it("shows waiting for approval immediately", () => {
      expect(
        sessionDisplayStatus("running", {
          ownedConversationStatus: "waiting_approval",
        }),
      ).toBe("waiting_approval");
    });

    it.each(["done", "error", "cancelled"] as const)(
      "shows the locally observed terminal status %s over a stale running snapshot",
      (ownedConversationStatus) => {
        expect(
          sessionDisplayStatus("running", { ownedConversationStatus }),
        ).toBe(ownedConversationStatus);
      },
    );
  });
});
