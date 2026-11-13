import { InterfaceText } from "@/features/i18n/interface-text";
import { Suspense } from "react";
import { SubscriptionDashboardPage } from "@/components/analytics/subscription-dashboard";

export default function Page() {
  return (
    <Suspense
      fallback={
        <p className="p-6 text-sm text-ink-muted">
          <InterfaceText>Loading subscriptions...</InterfaceText>
        </p>
      }
    >
      <SubscriptionDashboardPage />
    </Suspense>
  );
}
