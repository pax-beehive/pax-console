import { describe, expect, it } from "vitest";
import { canSeeAdminFeatures, isAdminUser } from "./admin-view";

describe("admin view", () => {
  it("recognizes explicit and role-based admins", () => {
    expect(isAdminUser({ user_id: "one", is_admin: true })).toBe(true);
    expect(isAdminUser({ user_id: "two", role: "owner" })).toBe(true);
    expect(isAdminUser({ user_id: "three", role: "member" })).toBe(false);
  });

  it("hides admin features while previewing the user experience", () => {
    const admin = { user_id: "admin", is_admin: true };

    expect(canSeeAdminFeatures(admin, false)).toBe(true);
    expect(canSeeAdminFeatures(admin, true)).toBe(false);
  });
});
