"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { FeatureRoute } from "@/features/flags";
import { EnvelopesPageClient } from "./envelopes-page-client";
import { FriendsPageClient } from "./friends-page-client";
import { KnowledgePageClient } from "./knowledge-page-client";
import { TeamsPageClient } from "./teams-page-client";

const pageClients = {
  envelopes: EnvelopesPageClient,
  friends: FriendsPageClient,
  knowledge: KnowledgePageClient,
  teams: TeamsPageClient,
};

type CollaborationRouteProps = {
  kind: keyof typeof pageClients;
};

export function CollaborationRoute({ kind }: CollaborationRouteProps) {
  const PageClient = pageClients[kind];
  return (
    <AuthGate>
      {(user) => (
        <FeatureRoute feature="collaboration">
          <PageClient user={user} />
        </FeatureRoute>
      )}
    </AuthGate>
  );
}
