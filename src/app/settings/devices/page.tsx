"use client";

import { MyDevicesPage } from "@/components/resources/my-devices-page";
import { AuthGate } from "@/features/auth/auth-gate";

export default function DevicesPage() {
  return <AuthGate>{(user) => <MyDevicesPage user={user} />}</AuthGate>;
}
