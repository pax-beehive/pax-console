"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/features/api/client";
import { ApiError } from "@/features/api/errors";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { useCurrentUser } from "@/features/auth/use-current-user";
import { useConsoleStore } from "@/stores/console-store";

export type FeatureKey =
  | "secretary"
  | "notifications"
  | "collaboration"
  | "knowledge_capsules"
  | "browser_control"
  | "android_control"
  | "voice_input";

type FeaturesSnapshot = {
  revision: number;
  features: Partial<Record<FeatureKey, boolean>>;
};

type LegacyManager = { legacy: true };

/** Preview and account identities must never share a resolved feature snapshot. */
export const featuresQueryKey = (
  userId: string | undefined,
  previewAsUser: boolean,
) => ["features", userId, previewAsUser] as const;

/**
 * Manager owns feature resolution, including preview-as-user and trial users.
 * Only an old Manager's HTTP 404 opts into the previous admin-only behavior.
 * Other failures fail closed unless TanStack Query has a cached snapshot.
 */
export function useFeatures(): {
  ready: boolean;
  enabled: (key: FeatureKey) => boolean;
} {
  const userQuery = useCurrentUser();
  const user = userQuery.data;
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const query = useQuery<FeaturesSnapshot | LegacyManager>({
    queryKey: featuresQueryKey(user?.user_id, previewAsUser),
    enabled: Boolean(user?.user_id),
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<FeaturesSnapshot>(
          `/api/v1/user/self/features${previewAsUser ? "?as=user" : ""}`,
          { signal },
        );
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return { legacy: true };
        }
        throw error;
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const snapshot = query.data;

  return {
    ready: Boolean(snapshot || query.isError || (!user && userQuery.isError)),
    enabled: (key) => {
      if (!user || !snapshot) return false;
      if ("legacy" in snapshot) return canSeeAdminFeatures(user, previewAsUser);
      return snapshot.features?.[key] === true;
    },
  };
}

/** Use for product features; pure administrator tools keep their role checks. */
export function useFeature(key: FeatureKey): boolean {
  return useFeatures().enabled(key);
}
