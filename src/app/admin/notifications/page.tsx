import { Suspense } from "react";
import { SubscriptionDashboardPage } from "@/components/analytics/subscription-dashboard";

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-ink-muted">Loading subscriptions...</p>
      }
    >
      <SubscriptionDashboardPage />
    </Suspense>
  );
}
