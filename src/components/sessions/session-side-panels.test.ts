import { describe, expect, it } from "vitest";
import { canSeeSessionSidePanel } from "./session-side-panels";

describe("canSeeSessionSidePanel", () => {
  it("shows tool evidence and artifacts to regular users", () => {
    expect(canSeeSessionSidePanel("tool", false)).toBe(true);
    expect(canSeeSessionSidePanel("artifacts", false)).toBe(true);
  });

  it("shows knowledge tools only when the knowledge capsules feature is enabled", () => {
    expect(canSeeSessionSidePanel("knowledge", false)).toBe(false);
    expect(canSeeSessionSidePanel("knowledge", true)).toBe(true);
  });
});
