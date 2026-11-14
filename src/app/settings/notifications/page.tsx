"use client";
import { AuthGate } from "@/features/auth/auth-gate";
import { FeatureRoute } from "@/features/flags";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { NotificationSettings } from "@/components/settings/notification-settings";
export default function NotificationsPage() {
  return (
    <AuthGate>
      {(user) => (
        <FeatureRoute feature="notifications">
          <ConsoleLayout user={user}>
            <NotificationSettings userId={user.user_id} />
          </ConsoleLayout>
        </FeatureRoute>
      )}
    </AuthGate>
  );
}
