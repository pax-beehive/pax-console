"use client";

import { AuthGate } from "@/features/auth/auth-gate";
import { FleetOverview } from "./fleet-overview";

export function HomeRouteClient() {
  return <AuthGate>{(user) => <FleetOverview user={user} />}</AuthGate>;
}
