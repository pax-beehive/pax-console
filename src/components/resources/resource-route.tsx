"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { ResourcePageClient } from "./resource-page-client";

type ResourceRouteProps = {
  kind:
    | "nodes"
    | "agents"
    | "sessions"
    | "approvals"
    | "security"
    | "monitor"
    | "api-keys"
    | "node-registration";
};

export function ResourceRoute({ kind }: ResourceRouteProps) {
  return (
    <AuthGate>
      {(user) => <ResourcePageClient kind={kind} user={user} />}
    </AuthGate>
  );
}
