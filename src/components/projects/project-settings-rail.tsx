"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ChevronRight,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import {
  archiveProject,
  createProject,
  updateProject,
  useProjects,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import type { Project } from "@/features/api/types";
import { cn } from "@/lib/utils";

type ProjectSettingsRailProps = {
  onSelectProject: (projectId: string) => void;
  selectedProjectId?: string;
  userId: string;
};

type ProjectEditorState =
  | { mode: "create"; project?: undefined }
  | { mode: "edit"; project: Project };

type ProjectTreeNode = {
  children: ProjectTreeNode[];
  project: Project;
};

export function ProjectSettingsRail({
  onSelectProject,
  selectedProjectId,
  userId,
}: ProjectSettingsRailProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const projectsQuery = useProjects(userId, includeArchived);
  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects],
  );
  const tree = useMemo(() => buildProjectTree(projects), [projects]);
  const [editor, setEditor] = useState<ProjectEditorState | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<Project | null>(
    null,
  );

  function invalidateProjects() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.projectsRoot(userId),
    });
  }

  const archive = useMutation({
    mutationFn: (project: Project) =>
      archiveProject(userId, project.project_id),
    onSuccess: (_, project) => {
      if (selectedProjectId === project.project_id) {
        onSelectProject("");
      }
      setArchiveCandidate(null);
      invalidateProjects();
    },
  });

  return (
    <div className="grid">
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
        <span className="text-xs text-ink-tertiary">
          {t("{count} active", {
            count: projects.filter((project) => !project.archived_at).length,
          })}
        </span>
        <Button
          icon={<FolderPlus className="h-3.5 w-3.5" />}
          onClick={() => setEditor({ mode: "create" })}
          size="sm"
          tooltip={t("Create project")}
          type="button"
          variant="secondary"
        >
          {t("New project")}
        </Button>
      </div>

      <label className="flex items-center gap-2 border-b border-hairline px-3 py-2 text-xs text-ink-muted">
        <input
          checked={includeArchived}
          onChange={(event) => setIncludeArchived(event.target.checked)}
          type="checkbox"
        />
        {t("Include archived")}
      </label>

      {archive.error && (
        <div className="p-3">
          <InlineError error={archive.error} />
        </div>
      )}

      {editor && (
        <ProjectEditor
          editor={editor}
          onCancel={() => setEditor(null)}
          onSaved={(project) => {
            setEditor(null);
            invalidateProjects();
            onSelectProject(project.project_id);
          }}
          projects={projects.filter((project) => !project.archived_at)}
          userId={userId}
        />
      )}

      {projectsQuery.error && (
        <div className="p-3">
          <InlineError error={projectsQuery.error} />
        </div>
      )}
      {projectsQuery.isLoading ? (
        <EmptyState label={t("Loading projects")} />
      ) : tree.length === 0 ? (
        <EmptyState label={t("No projects yet")} />
      ) : (
        <div className="grid py-1">
          {tree.map((node) => (
            <ProjectTreeRow
              depth={0}
              key={node.project.project_id}
              node={node}
              onArchive={setArchiveCandidate}
              onEdit={(project) => setEditor({ mode: "edit", project })}
              onSelectProject={onSelectProject}
              selectedProjectId={selectedProjectId}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        confirmLabel={t("Archive project")}
        description={
          <>
            {t("Archive")} <strong>{archiveCandidate?.display_name}</strong>
            {t(
              "? Child projects and existing sessions will remain available. This project will be hidden from Home project choices. You can view it using Include archived.",
            )}
          </>
        }
        disabled={archive.isPending}
        onConfirm={() => {
          if (archiveCandidate) {
            archive.mutate(archiveCandidate);
          }
        }}
        onOpenChange={(open) => {
          if (!open && !archive.isPending) {
            setArchiveCandidate(null);
          }
        }}
        open={Boolean(archiveCandidate)}
        title={t("Archive project")}
      />
    </div>
  );
}

function ProjectEditor({
  editor,
  onCancel,
  onSaved,
  projects,
  userId,
}: {
  editor: ProjectEditorState;
  onCancel: () => void;
  onSaved: (project: Project) => void;
  projects: Project[];
  userId: string;
}) {
  const { t } = useI18n();
  const currentProject = editor.project;
  const [name, setName] = useState(currentProject?.display_name ?? "");
  const [parentProjectId, setParentProjectId] = useState(
    currentProject?.parent_project_id ?? "",
  );
  const excludedParentIDs = useMemo(
    () =>
      currentProject
        ? projectDescendantIDs(projects, currentProject.project_id)
        : new Set<string>(),
    [currentProject, projects],
  );
  const save = useMutation({
    mutationFn: () =>
      editor.mode === "create"
        ? createProject(userId, {
            display_name: name.trim(),
            parent_project_id: parentProjectId || undefined,
          })
        : updateProject(userId, editor.project.project_id, {
            display_name: name.trim(),
            parent_project_id: parentProjectId,
          }),
    onSuccess: (data) => onSaved(data.project),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim()) {
      save.mutate();
    }
  }

  return (
    <form
      className="grid gap-2 border-b border-hairline bg-canvas p-3"
      onSubmit={submit}
    >
      <label className="text-xs font-medium text-ink">
        {editor.mode === "create" ? t("Create project") : t("Edit project")}
      </label>
      <input
        aria-label={t("Project name")}
        autoFocus
        className="min-h-9 rounded-md border border-hairline bg-surface-1 px-2.5 text-base text-ink outline-none focus:border-primary-focus sm:text-sm"
        maxLength={100}
        onChange={(event) => setName(event.target.value)}
        placeholder={t("Project name")}
        value={name}
      />
      <label className="grid gap-1 text-xs text-ink-tertiary">
        {t("Parent")}{" "}
        <select
          aria-label={t("Parent project")}
          className="min-h-9 rounded-md border border-hairline bg-surface-1 px-2.5 text-base text-ink outline-none focus:border-primary-focus sm:text-sm"
          onChange={(event) => setParentProjectId(event.target.value)}
          value={parentProjectId}
        >
          <option value="">{t("No parent")}</option>
          {projects
            .filter(
              (project) =>
                project.project_id !== currentProject?.project_id &&
                !excludedParentIDs.has(project.project_id),
            )
            .map((project) => (
              <option key={project.project_id} value={project.project_id}>
                {project.display_name}
              </option>
            ))}
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          {t("Cancel")}
        </Button>
        <Button
          disabled={!name.trim() || save.isPending}
          icon={<Plus className="h-3.5 w-3.5" />}
          type="submit"
          variant="primary"
        >
          {editor.mode === "create" ? t("Create") : t("Save")}
        </Button>
      </div>
      {save.error && <InlineError error={save.error} />}
    </form>
  );
}

function ProjectTreeRow({
  depth,
  node,
  onArchive,
  onEdit,
  onSelectProject,
  selectedProjectId,
}: {
  depth: number;
  node: ProjectTreeNode;
  onArchive: (project: Project) => void;
  onEdit: (project: Project) => void;
  onSelectProject: (projectId: string) => void;
  selectedProjectId?: string;
}) {
  const { t } = useI18n();
  const selected = node.project.project_id === selectedProjectId;

  return (
    <>
      <div
        className={cn(
          "group flex min-w-0 items-center gap-1 border-b border-hairline/70 pr-2 transition",
          selected
            ? "bg-accent/10 text-ink shadow-[inset_2px_0_0_var(--color-accent)]"
            : "text-ink-muted hover:bg-surface-2 hover:text-ink",
        )}
        style={{ paddingLeft: `${10 + depth * 18}px` }}
      >
        <button
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onSelectProject(node.project.project_id)}
          type="button"
        >
          {node.children.length > 0 ? (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-tertiary" />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Folder className="h-4 w-4 shrink-0 text-accent-bright" />
          <span className="truncate text-sm">{node.project.display_name}</span>
          {node.project.archived_at && (
            <Badge tone="neutral">{t("Archived")}</Badge>
          )}
        </button>
        {!node.project.archived_at && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={t("Actions for {value1}", {
                  value1: node.project.display_name,
                })}
                className="opacity-100 lg:opacity-70 lg:group-hover:opacity-100"
                icon={<MoreHorizontal className="h-4 w-4" />}
                size="icon"
                tooltip={t("Project actions")}
                type="button"
                variant="ghost"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => onEdit(node.project)}>
                <Pencil className="h-4 w-4" />
                {t("Edit project")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onArchive(node.project)}>
                <Archive className="h-4 w-4" />
                {t("Archive project")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {node.children.map((child) => (
        <ProjectTreeRow
          depth={depth + 1}
          key={child.project.project_id}
          node={child}
          onArchive={onArchive}
          onEdit={onEdit}
          onSelectProject={onSelectProject}
          selectedProjectId={selectedProjectId}
        />
      ))}
    </>
  );
}

function buildProjectTree(projects: Project[]): ProjectTreeNode[] {
  const nodes = new Map<string, ProjectTreeNode>(
    projects.map((project) => [project.project_id, { children: [], project }]),
  );
  const roots: ProjectTreeNode[] = [];

  for (const node of nodes.values()) {
    const parent = node.project.parent_project_id
      ? nodes.get(node.project.parent_project_id)
      : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (items: ProjectTreeNode[]) => {
    items.sort((left, right) =>
      left.project.display_name.localeCompare(right.project.display_name),
    );
    for (const item of items) {
      sortNodes(item.children);
    }
  };
  sortNodes(roots);
  return roots;
}

function projectDescendantIDs(projects: Project[], projectId: string) {
  const children = new Map<string, string[]>();
  for (const project of projects) {
    if (!project.parent_project_id) {
      continue;
    }
    const siblings = children.get(project.parent_project_id) ?? [];
    siblings.push(project.project_id);
    children.set(project.parent_project_id, siblings);
  }
  const descendants = new Set<string>();
  const pending = [...(children.get(projectId) ?? [])];
  while (pending.length > 0) {
    const child = pending.pop();
    if (!child || descendants.has(child)) {
      continue;
    }
    descendants.add(child);
    pending.push(...(children.get(child) ?? []));
  }
  return descendants;
}
