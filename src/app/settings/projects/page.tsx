"use client";

import { ProjectSettingsPage } from "@/components/projects/project-settings-page";
import { AuthGate } from "@/features/auth/auth-gate";

export default function ProjectsSettingsPage() {
  return <AuthGate>{(user) => <ProjectSettingsPage user={user} />}</AuthGate>;
}
