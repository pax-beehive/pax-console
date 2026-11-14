import { describe, expect, it } from "vitest";
import { canSeeSessionSidePanel } from "./session-side-panels";

const none = {
  androidControl: false,
  browserControl: false,
  knowledgeCapsules: false,
};

describe("canSeeSessionSidePanel", () => {
  it("shows tool evidence and artifacts to regular users", () => {
    expect(canSeeSessionSidePanel("tool", none)).toBe(true);
    expect(canSeeSessionSidePanel("artifacts", none)).toBe(true);
  });

  it.each([
    ["knowledge", "knowledgeCapsules"],
    ["browser", "browserControl"],
    ["mobile", "androidControl"],
  ] as const)(
    "shows the %s panel only when its feature is enabled",
    (panel, feature) => {
      expect(canSeeSessionSidePanel(panel, none)).toBe(false);
      expect(canSeeSessionSidePanel(panel, { ...none, [feature]: true })).toBe(
        true,
      );
      // Another feature being on does not open this panel.
      const others = {
        androidControl: true,
        browserControl: true,
        knowledgeCapsules: true,
        [feature]: false,
      };
      expect(canSeeSessionSidePanel(panel, others)).toBe(false);
    },
  );
});
