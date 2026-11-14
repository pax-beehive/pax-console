"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFeatures, type FeatureKey } from "./use-feature";

type FeatureRouteProps = {
  feature: FeatureKey;
  children: ReactNode;
  fallbackHref?: "/" | "/settings";
};

/**
 * Hides gated content immediately and redirects after resolution. Settings
 * routes return to /settings; other routes return home. A caller may explicitly
 * choose either destination. This UI guard does not replace Manager permission checks.
 */
export function FeatureRoute({
  feature,
  children,
  fallbackHref,
}: FeatureRouteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { ready, enabled } = useFeatures();
  const allowed = enabled(feature);
  const destination =
    fallbackHref ?? (pathname.startsWith("/settings/") ? "/settings" : "/");

  useEffect(() => {
    if (ready && !allowed) router.replace(destination);
  }, [allowed, destination, ready, router]);

  return allowed ? <>{children}</> : null;
}
