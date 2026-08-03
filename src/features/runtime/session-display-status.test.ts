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
});
