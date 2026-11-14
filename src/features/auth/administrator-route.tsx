"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import { canSeeAdminFeatures } from "./admin-view";

/**
 * Shows a page to administrators only and sends everyone else, including an
 * administrator who is previewing as a user, to `fallbackHref`.
 */
export function AdministratorRoute({
  children,
  fallbackHref,
  user,
}: {
  children: ReactNode;
  fallbackHref: string;
  user: User;
}) {
  const router = useRouter();
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const allowed = canSeeAdminFeatures(user, previewAsUser);
  useEffect(() => {
    if (!allowed) router.replace(fallbackHref);
  }, [allowed, fallbackHref, router]);
  return allowed ? children : null;
}
