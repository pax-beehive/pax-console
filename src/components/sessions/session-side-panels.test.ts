import { describe, expect, it } from "vitest";
import { canSeeSessionSidePanel } from "./session-side-panels";

describe("canSeeSessionSidePanel", () => {
  it("shows tool evidence and artifacts to regular users", () => {
    expect(canSeeSessionSidePanel("tool", false)).toBe(true);
    expect(canSeeSessionSidePanel("artifacts", false)).toBe(true);
  });

  it("keeps knowledge tools admin-only", () => {
    expect(canSeeSessionSidePanel("knowledge", false)).toBe(false);
    expect(canSeeSessionSidePanel("knowledge", true)).toBe(true);
  });
});
