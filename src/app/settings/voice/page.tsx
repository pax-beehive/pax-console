"use client";
import { AuthGate } from "@/features/auth/auth-gate";
import { FeatureRoute } from "@/features/flags";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { VoiceSettings } from "@/components/settings/voice-settings";
export default function VoiceSettingsPage() {
  return (
    <AuthGate>
      {(user) => (
        <FeatureRoute feature="voice_input">
          <ConsoleLayout user={user}>
            <VoiceSettings />
          </ConsoleLayout>
        </FeatureRoute>
      )}
    </AuthGate>
  );
}
