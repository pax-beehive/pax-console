import { describe, expect, it } from "vitest";
import { mergeRecoveredInitialPromptDraft } from "./session-initial-prompt";

describe("initial prompt recovery", () => {
  it("restores a failed initial prompt into an empty composer", () => {
    expect(mergeRecoveredInitialPromptDraft("  inspect this  ", "")).toBe(
      "inspect this",
    );
  });

  it("does not duplicate a prompt already present in the composer", () => {
    expect(
      mergeRecoveredInitialPromptDraft("inspect this", " inspect this "),
    ).toBe(" inspect this ");
  });

  it("preserves text entered while the initial prompt was in flight", () => {
    expect(
      mergeRecoveredInitialPromptDraft(
        "inspect this",
        "also check the integration tests",
      ),
    ).toBe("inspect this\n\nalso check the integration tests");
  });
});
