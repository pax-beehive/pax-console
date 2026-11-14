"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { ResourcePageClient } from "./resource-page-client";

type ResourceRouteProps = {
  kind:
    | "sessions"
    | "approvals"
    | "security"
    | "grants"
    | "encryption"
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
