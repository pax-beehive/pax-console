"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FolderTree } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { EmptyState } from "@/components/ui/empty-state";
import { useAgents, useNodes, useProjects } from "@/features/api/resources";
import type { User } from "@/features/api/types";
import { ProjectSettingsDetail } from "./project-settings-detail";
import { ProjectSettingsRail } from "./project-settings-rail";

export function ProjectSettingsPage({ user }: { user: User }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectsQuery = useProjects(user.user_id);
  const nodesQuery = useNodes(user.user_id);
  const agentsQuery = useAgents(user.user_id);
  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects],
  );
  const requestedProjectId = searchParams.get("project") ?? "";
  const [selectedProjectId, setSelectedProjectId] =
    useState(requestedProjectId);
  const effectiveSelectedProjectId =
    projectsQuery.isLoading ||
    projects.some((project) => project.project_id === selectedProjectId)
      ? selectedProjectId
      : "";

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId);
    const query = projectId ? `?project=${encodeURIComponent(projectId)}` : "";
    router.replace(`/settings/projects${query}`);
  }

  return (
    <ConsoleLayout user={user}>
      <main className="grid min-h-0 flex-1 overflow-hidden bg-canvas lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
        <section className="min-h-0 overflow-auto border-b border-hairline bg-surface-1 lg:border-b-0 lg:border-r">
          <div className="sticky top-0 z-10 border-b border-hairline bg-surface-1 px-4 py-4">
            <div className="flex items-center gap-2">
              <FolderTree className="h-4 w-4 text-accent-bright" />
              <h1 className="font-medium text-ink">Projects</h1>
            </div>
            <p className="mt-1 text-xs text-ink-tertiary">
              Organize work and configure reusable workspace targets.
            </p>
          </div>
          <ProjectSettingsRail
            onSelectProject={selectProject}
            selectedProjectId={effectiveSelectedProjectId}
            userId={user.user_id}
          />
        </section>
        {effectiveSelectedProjectId ? (
          <ProjectSettingsDetail
            agents={agentsQuery.data?.agents ?? []}
            nodes={nodesQuery.data?.nodes ?? []}
            projectId={effectiveSelectedProjectId}
            userId={user.user_id}
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-5">
            <EmptyState label="Select a project to configure its workspace targets" />
          </div>
        )}
      </main>
    </ConsoleLayout>
  );
}
