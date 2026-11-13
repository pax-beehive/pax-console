"use client";
import { useI18n } from "@/features/i18n/use-i18n";

import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { ConnectionOnboarding } from "@/components/connect/connection-onboarding";
import type { User } from "@/features/api/types";
import { SettingsBack, settingsLinks } from "./settings-navigation";

export function AddDevicePage({
  intent = "device",
  nodeId,
}: {
  intent?: "device" | "agent";
  nodeId?: string;
}) {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <AddDeviceContent user={user} intent={intent} nodeId={nodeId} />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}

export function AddDeviceContent({
  user,
  intent = "device",
  nodeId,
}: {
  user: User;
  intent?: "device" | "agent";
  nodeId?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <SettingsBack href={settingsLinks.devices} label={t("Devices")} />
        <ConnectionOnboarding
          key={`${user.user_id}:${intent}:${nodeId ?? ""}`}
          userId={user.user_id}
          intent={intent}
          initialNodeId={nodeId}
        />
      </div>
    </div>
  );
}
