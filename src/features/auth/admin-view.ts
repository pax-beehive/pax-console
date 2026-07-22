import type { User } from "@/features/api/types";

export function isAdminUser(user: User) {
  const role = user.role?.toLowerCase();
  return Boolean(user.is_admin || role === "admin" || role === "owner");
}

export function canSeeAdminFeatures(user: User, previewAsUser: boolean) {
  return isAdminUser(user) && !previewAsUser;
}
