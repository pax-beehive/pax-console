"use client";

import { useConsoleStore } from "@/stores/console-store";
import { canSeeAdminFeatures } from "./admin-view";
import { useCurrentUser } from "./use-current-user";

/** Whether the signed-in account currently sees administrator-only content. */
export function useAdminView() {
  const user = useCurrentUser().data;
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  return Boolean(user && canSeeAdminFeatures(user, previewAsUser));
}
