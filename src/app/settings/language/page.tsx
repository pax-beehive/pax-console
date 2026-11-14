"use client";
import { AuthGate } from "@/features/auth/auth-gate";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { LanguageSettings } from "@/components/settings/language-settings";
export default function LanguageSettingsPage() {
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <LanguageSettings />
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}
