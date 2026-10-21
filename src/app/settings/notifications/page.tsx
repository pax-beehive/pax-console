"use client";
import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { NotificationSettings } from "@/components/settings/notification-settings";
export default function NotificationsPage() {
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
