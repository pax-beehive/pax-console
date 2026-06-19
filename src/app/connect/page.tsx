import { Suspense } from "react";
import { PaxdConnectPageClient } from "@/components/connect/paxd-connect-page-client";

export default function ConnectPage() {
  return (
    <Suspense fallback={<ConnectFallback />}>
      <PaxdConnectPageClient />
    </Suspense>
  );
}

function ConnectFallback() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6 text-ink">
      <section className="w-full max-w-md rounded-xl border border-hairline bg-surface-1 p-5">
        <div className="text-sm text-ink-muted">Loading pairing session...</div>
      </section>
    </main>
  );
}
