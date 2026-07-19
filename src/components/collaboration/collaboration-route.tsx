"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { EnvelopesPageClient } from "./envelopes-page-client";
import { KnowledgePageClient } from "./knowledge-page-client";

type CollaborationRouteProps = {
  kind: "envelopes" | "knowledge";
};

export function CollaborationRoute({ kind }: CollaborationRouteProps) {
  return (
    <AuthGate>
      {(user) =>
        kind === "envelopes" ? (
          <EnvelopesPageClient user={user} />
        ) : (
          <KnowledgePageClient user={user} />
        )
      }
    </AuthGate>
  );
}
