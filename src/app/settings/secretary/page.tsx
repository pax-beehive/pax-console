"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { SecretarySettingsPage } from "@/components/secretary/secretary-settings-page";

export default function SecretaryPage() {
  return (
    <AuthGate>
      {(user) => <SecretarySettingsPage key={user.user_id} user={user} />}
    </AuthGate>
  );
}
