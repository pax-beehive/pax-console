"use client";

import { useApprovalGrants } from "@/features/api/resources";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useFeatures } from "@/features/flags";
import { useConsoleStore } from "@/stores/console-store";
import { visibleSettingsGroups } from "./settings-catalog";

/**
 * The settings entries the signed-in account sees, on every screen size.
 * An entry tied to a feature follows that feature's flag, so it stays out of
 * the directory until the feature is enabled for this account. Allowed
 * actions stays hidden until the account has a standing permission, because
 * the web console only grants one-off approvals.
 */
export function useVisibleSettingsGroups() {
  const user = useCurrentUser().data;
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const grants = useApprovalGrants(user?.user_id).data?.grants;
  const { enabled } = useFeatures();
  return visibleSettingsGroups({
    admin: Boolean(user && canSeeAdminFeatures(user, previewAsUser)),
    hasGrants: Boolean(grants?.some((grant) => !grant.grant_revoked_at)),
    featureEnabled: enabled,
  });
}
