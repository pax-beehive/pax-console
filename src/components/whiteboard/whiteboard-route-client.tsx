"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { WhiteboardPageClient } from "./whiteboard-page-client";

export function WhiteboardRouteClient() {
  return (
    <AuthGate>
      {(user) => <WhiteboardPageClient user={user} />}
    </AuthGate>
  );
}
