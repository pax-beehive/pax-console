"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { EnvelopesPageClient } from "./envelopes-page-client";
import { FriendsPageClient } from "./friends-page-client";
import { KnowledgePageClient } from "./knowledge-page-client";
import { TeamsPageClient } from "./teams-page-client";

type CollaborationRouteProps = {
  kind: "envelopes" | "friends" | "knowledge" | "teams";
};

export function CollaborationRoute({ kind }: CollaborationRouteProps) {
  return (
    <AuthGate>
      {(user) => {
        if (kind === "envelopes") {
          return <EnvelopesPageClient user={user} />;
        }

        if (kind === "friends") {
          return <FriendsPageClient user={user} />;
        }

        if (kind === "knowledge") {
          return <KnowledgePageClient user={user} />;
        }

        return <TeamsPageClient user={user} />;
      }}
    </AuthGate>
  );
}
