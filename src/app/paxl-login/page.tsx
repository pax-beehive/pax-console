import { InterfaceText } from "@/features/i18n/interface-text";
import { Suspense } from "react";
import { PaxlLoginPageClient } from "@/components/connect/paxl-login-page-client";

export default function PaxlLoginPage() {
  return (
    <Suspense fallback={<PaxlLoginFallback />}>
      <PaxlLoginPageClient />
    </Suspense>
  );
}

function PaxlLoginFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
      <section className="w-full max-w-md rounded-xl border border-hairline bg-surface-1 p-5">
        <div className="text-sm text-ink-muted">
          <InterfaceText>Loading device approval...</InterfaceText>
        </div>
      </section>
    </main>
  );
}
