"use client";
import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { VoiceSettings } from "@/components/settings/voice-settings";
export default function VoiceSettingsPage() {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <VoiceSettings />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}
