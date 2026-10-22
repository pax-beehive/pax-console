"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { NotificationSettings } from "./notification-settings";

export function SettingsPage() {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <NotificationSettings userId={user.user_id} />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}
