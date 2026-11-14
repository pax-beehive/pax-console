"use client";

import { useMemo } from "react";
import { useApprovalGrants } from "@/features/api/resources";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useConsoleStore } from "@/stores/console-store";
import { visibleSettingsGroups } from "./settings-catalog";

/**
 * The settings entries the signed-in account sees, on every screen size.
 * Allowed actions stays hidden until the account has a standing permission,
 * because the web console only grants one-off approvals.
 */
export function useVisibleSettingsGroups() {
  const user = useCurrentUser().data;
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const grants = useApprovalGrants(user?.user_id).data?.grants;
  const admin = Boolean(user && canSeeAdminFeatures(user, previewAsUser));
  const hasGrants = Boolean(grants?.some((grant) => !grant.grant_revoked_at));
  return useMemo(
    () => visibleSettingsGroups({ admin, hasGrants }),
    [admin, hasGrants],
  );
}
