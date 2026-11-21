"use client";

import Link from "next/link";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Button } from "@/components/ui/button";
import { AuthGate } from "@/features/auth/auth-gate";
import { useI18n } from "@/features/i18n/use-i18n";
import { HostedSandboxCreate } from "./hosted-sandbox-create";

export function MySandboxPage() {
  const { t } = useI18n();
  return (
    <AuthGate>
      {(user) => (
        <ConsoleLayout user={user}>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto grid max-w-2xl justify-items-start gap-4">
              <Button asChild variant="ghost">
                <Link href="/">{t("Back to Home")}</Link>
              </Button>
              <h1 className="text-2xl font-semibold">{t("My sandbox")}</h1>
              <div className="w-full">
                <HostedSandboxCreate userId={user.user_id} dedicated />
              </div>
            </div>
          </div>
        </ConsoleLayout>
      )}
    </AuthGate>
  );
}
