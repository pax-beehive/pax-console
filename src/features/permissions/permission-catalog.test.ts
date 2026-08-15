import { describe, expect, it } from "vitest";
import {
  PAX_AUTO_APPROVE_CHOICE_ID,
  PAX_MANUAL_CHOICE_ID,
  approvalModeForPermissionChoice,
  defaultPermissionChoiceId,
  permissionChoicesFromCatalog,
  resolvePermissionChoiceId,
  shouldRecoverPermissionCatalogAfterCreateFailure,
  shouldWaitForInitialPermissionCatalog,
} from "./permission-catalog";

describe("permission catalog", () => {
  it("adds PAX auto approve ahead of native agent choices", () => {
    const choices = permissionChoicesFromCatalog({
      catalog_revision: 1,
      choices: [
        {
          choice_id: "agent:workspace",
          kind: "agent",
          label: "Workspace access",
        },
      ],
      source: "profile",
      stale: false,
    });

    expect(choices.map((choice) => choice.choice_id)).toEqual([
      PAX_AUTO_APPROVE_CHOICE_ID,
      "agent:workspace",
    ]);
  });

  it("falls back to the existing manual and auto choices", () => {
    expect(permissionChoicesFromCatalog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ choice_id: PAX_AUTO_APPROVE_CHOICE_ID }),
        expect.objectContaining({ choice_id: PAX_MANUAL_CHOICE_ID }),
      ]),
    );
  });

  it("uses a valid catalog default without trusting an unknown id", () => {
    const choices = permissionChoicesFromCatalog({
      catalog_revision: "rev-1",
      default_choice_id: "agent:workspace",
      choices: [
        {
          choice_id: "agent:read-only",
          kind: "agent",
          label: "Read only",
        },
        {
          choice_id: "agent:workspace",
          kind: "agent",
          label: "Workspace access",
        },
      ],
      source: "observed",
      stale: false,
    });

    expect(
      defaultPermissionChoiceId(choices, "manual", "agent:workspace"),
    ).toBe("agent:workspace");
    expect(defaultPermissionChoiceId(choices, "manual", "unknown")).toBe(
      "agent:read-only",
    );
  });

  it("never auto-selects a choice that requires confirmation", () => {
    const choices = permissionChoicesFromCatalog({
      catalog_revision: 2,
      choices: [
        {
          choice_id: "agent:full-access",
          kind: "agent",
          label: "Full access",
          requires_confirmation: true,
        },
        {
          choice_id: "agent:workspace",
          kind: "agent",
          label: "Workspace access",
        },
      ],
      default_choice_id: "agent:full-access",
      source: "profile",
      stale: false,
    });

    expect(
      defaultPermissionChoiceId(choices, "manual", "agent:full-access"),
    ).toBe(PAX_MANUAL_CHOICE_ID);
    expect(defaultPermissionChoiceId(choices, "manual")).toBe(
      PAX_MANUAL_CHOICE_ID,
    );
  });

  it("derives legacy approval mode from the stable choice id", () => {
    expect(approvalModeForPermissionChoice(PAX_AUTO_APPROVE_CHOICE_ID)).toBe(
      "auto_approve_all",
    );
    expect(approvalModeForPermissionChoice("agent:full-access")).toBe("manual");
  });

  it("preserves an explicit native choice while a second catalog query is pending", () => {
    const pendingChoices = permissionChoicesFromCatalog();

    expect(
      resolvePermissionChoiceId(
        pendingChoices,
        "manual",
        "agent:workspace",
        undefined,
        true,
      ),
    ).toBe("agent:workspace");
  });

  it("drops an explicit choice that is absent from a resolved catalog", () => {
    const resolvedChoices = permissionChoicesFromCatalog({
      catalog_revision: 2,
      choices: [
        {
          choice_id: "agent:read-only",
          kind: "agent",
          label: "Read only",
        },
      ],
      default_choice_id: "agent:read-only",
      source: "profile",
      stale: false,
    });

    expect(
      resolvePermissionChoiceId(
        resolvedChoices,
        "manual",
        "agent:other-profile",
        "agent:read-only",
      ),
    ).toBe("agent:read-only");
  });

  it("preserves a committed manual fallback after native choices arrive", () => {
    const resolvedChoices = permissionChoicesFromCatalog({
      catalog_revision: 2,
      choices: [
        {
          choice_id: "agent:workspace",
          kind: "agent",
          label: "Workspace access",
        },
      ],
      source: "profile",
      stale: false,
    });

    expect(
      resolvePermissionChoiceId(
        resolvedChoices,
        "manual",
        PAX_MANUAL_CHOICE_ID,
      ),
    ).toBe(PAX_MANUAL_CHOICE_ID);
  });

  it("waits for initial-prompt permissions only when no choice was handed off", () => {
    expect(shouldWaitForInitialPermissionCatalog(undefined, true)).toBe(true);
    expect(shouldWaitForInitialPermissionCatalog("agent:workspace", true)).toBe(
      false,
    );
    expect(shouldWaitForInitialPermissionCatalog(undefined, false)).toBe(false);
  });

  it("recovers a stale native choice after live permission validation fails", () => {
    expect(
      shouldRecoverPermissionCatalogAfterCreateFailure("agent:mode:agent", 409),
    ).toBe(true);
    expect(
      shouldRecoverPermissionCatalogAfterCreateFailure("agent:mode:agent", 502),
    ).toBe(true);
    expect(
      shouldRecoverPermissionCatalogAfterCreateFailure(
        PAX_AUTO_APPROVE_CHOICE_ID,
        409,
      ),
    ).toBe(false);
    expect(
      shouldRecoverPermissionCatalogAfterCreateFailure("agent:mode:agent", 500),
    ).toBe(false);
  });
});
