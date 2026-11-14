"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/features/auth/auth-gate";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { useConsoleStore } from "@/stores/console-store";
import type { User } from "@/features/api/types";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { ConfigDashboard } from "./config-dashboard";

export function ConfigPage() {
  return <AuthGate>{(user) => <ConfigAccess user={user} />}</AuthGate>;
}

export function ConfigAccess({ user }: { user: User }) {
  const router = useRouter();
  const preview = useConsoleStore((state) => state.previewAsUser);
  const allowed = canSeeAdminFeatures(user, preview);
  useEffect(() => {
    if (!allowed) router.replace("/");
  }, [allowed, router]);
  if (!allowed) return null;
  return (
    <ConsoleLayout user={user}>
      <ConfigDashboard key={user.user_id} userId={user.user_id} />
    </ConsoleLayout>
  );
}
