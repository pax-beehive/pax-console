import { Suspense } from "react";
import { SecretarySummariesPage } from "@/components/secretary/secretary-summary-browser";

export default function SummariesPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-5 text-sm text-ink-muted">
          Loading summaries…
        </p>
      }
    >
      <SecretarySummariesPage />
    </Suspense>
  );
}
