"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { FeatureRoute } from "@/features/flags";
import { SecretarySettingsPage } from "@/components/secretary/secretary-settings-page";

export default function SecretaryPage() {
  return (
    <AuthGate>
      {(user) => (
        <FeatureRoute feature="secretary">
          <SecretarySettingsPage key={user.user_id} user={user} />
        </FeatureRoute>
      )}
    </AuthGate>
  );
}
