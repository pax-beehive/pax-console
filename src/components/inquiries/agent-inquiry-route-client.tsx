"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { AgentInquiryPageClient } from "./agent-inquiry-page-client";

export function AgentInquiryRouteClient() {
  return (
    <AuthGate>{(user) => <AgentInquiryPageClient user={user} />}</AuthGate>
  );
}
