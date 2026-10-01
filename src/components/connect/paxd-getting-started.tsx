"use client";

import { ConnectionOnboarding } from "./connection-onboarding";

export function PaxdGettingStartedGuide({
  userId,
  onStart,
}: {
  userId: string;
  onStart?: () => void;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-hairline bg-surface-1 p-5">
      <ConnectionOnboarding key={userId} userId={userId} onStart={onStart} />
    </section>
  );
}
