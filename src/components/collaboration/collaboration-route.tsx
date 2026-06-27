"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { EnvelopesPageClient } from "./envelopes-page-client";
import { KnowledgePageClient } from "./knowledge-page-client";
import { TeamFriendsPageClient } from "./team-friends-page-client";

type CollaborationRouteProps = {
  kind: "envelopes" | "knowledge" | "teams";
};

export function CollaborationRoute({ kind }: CollaborationRouteProps) {
  return (
    <AuthGate>
      {(user) => {
        if (kind === "envelopes") {
          return <EnvelopesPageClient user={user} />;
        }

        if (kind === "knowledge") {
          return <KnowledgePageClient user={user} />;
        }

        return <TeamFriendsPageClient user={user} />;
      }}
    </AuthGate>
  );
}
