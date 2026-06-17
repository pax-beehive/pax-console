"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { FleetOverview } from "./fleet-overview";

export function HomePageClient() {
  return <AuthGate>{(user) => <FleetOverview user={user} />}</AuthGate>;
}
