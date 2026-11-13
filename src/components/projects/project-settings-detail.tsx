"use client";

import { useI18n, type Translator } from "@/features/i18n/use-i18n";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleOff,
  FolderPlus,
  Laptop,
  Pencil,
  Power,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import {
  createProjectTarget,
  updateProjectTarget,
  useProject,
  useProjects,
  useProjectTargets,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import type { Agent, Node, Project, ProjectTarget } from "@/features/api/types";

type ProjectSettingsDetailProps = {
  agents: Agent[];
  nodes: Node[];
  projectId: string;
  userId: string;
};

type TargetEditorState =
  | { mode: "create"; target?: undefined }
  | { mode: "edit"; target: ProjectTarget };

export function ProjectSettingsDetail({
  agents,
  nodes,
  projectId,
  userId,
}: ProjectSettingsDetailProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const projectQuery = useProject(userId, projectId);
  const projectsQuery = useProjects(userId, true);
  const targetsQuery = useProjectTargets(userId, projectId);
  const [editor, setEditor] = useState<TargetEditorState | null>(null);
  const project = projectQuery.data?.project;
  const targets = targetsQuery.data?.targets ?? [];
  const path = useMemo(
    () =>
      project ? projectPath(project, projectsQuery.data?.projects ?? []) : [],
    [project, projectsQuery.data?.projects],
  );

  function invalidateTargets() {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.projectTargets(userId, projectId),
    });
  }

  const quickUpdate = useMutation({
    mutationFn: ({
      input,
      targetId,
    }: {
      input: { enabled?: boolean; is_default?: boolean };
      targetId: string;
    }) => updateProjectTarget(userId, projectId, targetId, input),
    onSuccess: invalidateTargets,
  });
  if (projectQuery.isLoading) {
    return (
      <ProjectSettingsDetailFrame
        body={<EmptyState label={t("Loading project")} />}
      />
    );
  }

  if (projectQuery.error) {
    return (
      <ProjectSettingsDetailFrame
        body={<InlineError error={projectQuery.error} />}
      />
    );
  }

  if (!project) {
    return (
      <ProjectSettingsDetailFrame
        body={<EmptyState label={t("Project not found")} />}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5">
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <header className="rounded-xl border border-hairline bg-surface-1 p-5">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-ink-tertiary">
            {t("Project")}
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-ink">
            {project.display_name}
          </h1>
          {project.archived_at && <Badge tone="neutral">{t("Archived")}</Badge>}
          <div className="mt-2 text-sm text-ink-tertiary">
            {path.map((item) => item.display_name).join(" / ")}
          </div>
          <p className="mt-4 max-w-2xl border-t border-hairline pt-4 text-sm leading-6 text-ink-muted">
            {t(
              "Configure reusable agent and workspace combinations here. Start project sessions from Home, where they use the normal conversation flow.",
            )}
          </p>
        </header>

        <section className="rounded-xl border border-hairline bg-surface-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
            <div>
              <h2 className="font-medium text-ink">{t("Workspace targets")}</h2>
              <p className="mt-1 text-sm text-ink-tertiary">
                {t(
                  "Reuse an agent and working directory when starting sessions.",
                )}
              </p>
            </div>
            <Button
              disabled={Boolean(project.archived_at)}
              icon={<FolderPlus className="h-4 w-4" />}
              onClick={() => setEditor({ mode: "create" })}
              type="button"
            >
              {t("Add workspace target")}
            </Button>
          </div>

          {editor && (
            <TargetEditor
              agents={agents}
              editor={editor}
              onCancel={() => setEditor(null)}
              onSaved={() => {
                setEditor(null);
                invalidateTargets();
              }}
              projectId={projectId}
              userId={userId}
            />
          )}

          {targetsQuery.error && (
            <div className="p-4">
              <InlineError error={targetsQuery.error} />
            </div>
          )}
          {quickUpdate.error && (
            <div className="px-4 pt-4">
              <InlineError error={quickUpdate.error} />
            </div>
          )}
          {targetsQuery.isLoading ? (
            <div className="p-4">
              <EmptyState label={t("Loading workspace targets")} />
            </div>
          ) : targets.length === 0 ? (
            <div className="p-4">
              <EmptyState label={t("No workspace targets yet")} />
            </div>
          ) : (
            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {targets.map((target) => {
                const agent = agents.find(
                  (item) => item.agent_id === target.agent_id,
                );
                const node = nodes.find(
                  (item) => item.node_id === agent?.node_id,
                );

                return (
                  <article
                    className="rounded-lg border border-hairline bg-canvas p-4"
                    key={target.target_id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-medium text-ink">
                            {target.display_name}
                          </h3>
                          {target.is_default && (
                            <Badge tone="accent">{t("Default")}</Badge>
                          )}
                          <Badge tone={target.enabled ? "success" : "neutral"}>
                            {target.enabled ? t("Enabled") : t("Disabled")}
                          </Badge>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
                          <Laptop className="h-4 w-4 shrink-0" />
                          <span>
                            {agentLabel(agent, target.agent_id)} ·{" "}
                            {nodeLabel(node, t)}
                          </span>
                        </div>
                        <div className="mt-2 break-all font-mono text-xs text-ink-tertiary">
                          {target.cwd}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        disabled={Boolean(project.archived_at)}
                        aria-label={t("Edit {value1}", {
                          value1: target.display_name,
                        })}
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => setEditor({ mode: "edit", target })}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {t("Edit")}
                      </Button>
                      {target.enabled && !target.is_default && (
                        <Button
                          aria-label={t("Make {value1} default", {
                            value1: target.display_name,
                          })}
                          disabled={
                            quickUpdate.isPending ||
                            Boolean(project.archived_at)
                          }
                          icon={<Star className="h-3.5 w-3.5" />}
                          onClick={() =>
                            quickUpdate.mutate({
                              input: { is_default: true },
                              targetId: target.target_id,
                            })
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          {t("Make default")}
                        </Button>
                      )}
                      <Button
                        aria-label={t(
                          target.enabled ? "Disable {name}" : "Enable {name}",
                          { name: target.display_name },
                        )}
                        disabled={
                          quickUpdate.isPending || Boolean(project.archived_at)
                        }
                        icon={
                          target.enabled ? (
                            <CircleOff className="h-3.5 w-3.5" />
                          ) : (
                            <Power className="h-3.5 w-3.5" />
                          )
                        }
                        onClick={() =>
                          quickUpdate.mutate({
                            input: { enabled: !target.enabled },
                            targetId: target.target_id,
                          })
                        }
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        {target.enabled ? t("Disable") : t("Enable")}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProjectSettingsDetailFrame({ body }: { body: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-5">
      <div className="mx-auto w-full max-w-5xl">{body}</div>
    </div>
  );
}

function TargetEditor({
  agents,
  editor,
  onCancel,
  onSaved,
  projectId,
  userId,
}: {
  agents: Agent[];
  editor: TargetEditorState;
  onCancel: () => void;
  onSaved: () => void;
  projectId: string;
  userId: string;
}) {
  const { t } = useI18n();
  const current = editor.target;
  const [name, setName] = useState(current?.display_name ?? "");
  const [agentId, setAgentId] = useState(
    current?.agent_id ?? agents[0]?.agent_id ?? "",
  );
  const [cwd, setCwd] = useState(current?.cwd ?? "");
  const [isDefault, setIsDefault] = useState(current?.is_default ?? false);
  const [enabled, setEnabled] = useState(current?.enabled ?? true);
  const save = useMutation({
    mutationFn: () =>
      editor.mode === "create"
        ? createProjectTarget(userId, projectId, {
            agent_id: agentId,
            cwd: cwd.trim(),
            display_name: name.trim(),
            enabled,
            is_default: isDefault,
          })
        : updateProjectTarget(userId, projectId, editor.target.target_id, {
            agent_id: agentId,
            cwd: cwd.trim(),
            display_name: name.trim(),
            enabled,
            is_default: isDefault,
          }),
    onSuccess: onSaved,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() && cwd.trim() && agentId) {
      save.mutate();
    }
  }

  return (
    <form
      className="grid gap-3 border-b border-hairline bg-canvas p-4 md:grid-cols-2"
      onSubmit={submit}
    >
      <label className="grid gap-1 text-xs text-ink-tertiary">
        {t("Name")}{" "}
        <input
          aria-label={t("Target name")}
          className="min-h-9 rounded-md border border-hairline bg-surface-1 px-2.5 text-base text-ink outline-none focus:border-primary-focus sm:text-sm"
          onChange={(event) => setName(event.target.value)}
          placeholder={t("Local workspace")}
          value={name}
        />
      </label>
      <label className="grid gap-1 text-xs text-ink-tertiary">
        {t("Agent")}{" "}
        <select
          aria-label={t("Target agent")}
          className="min-h-9 rounded-md border border-hairline bg-surface-1 px-2.5 text-base text-ink outline-none focus:border-primary-focus sm:text-sm"
          onChange={(event) => setAgentId(event.target.value)}
          value={agentId}
        >
          <option value="">{t("Select an agent")}</option>
          {agents.map((agent) => (
            <option key={agent.agent_id} value={agent.agent_id}>
              {agentLabel(agent, agent.agent_id)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-ink-tertiary md:col-span-2">
        {t("Workspace")}{" "}
        <input
          aria-label={t("Target workspace")}
          className="min-h-9 rounded-md border border-hairline bg-surface-1 px-2.5 font-mono text-base text-ink outline-none focus:border-primary-focus sm:text-sm"
          onChange={(event) => setCwd(event.target.value)}
          placeholder="~/project"
          spellCheck={false}
          value={cwd}
        />
      </label>
      <div className="flex flex-wrap items-center gap-4 text-sm text-ink-muted md:col-span-2">
        <label className="inline-flex items-center gap-2">
          <input
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
            type="checkbox"
          />
          {t("Make default")}
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          {t("Enabled")}
        </label>
      </div>
      <div className="flex justify-end gap-2 md:col-span-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          {t("Cancel")}
        </Button>
        <Button
          disabled={!name.trim() || !cwd.trim() || !agentId || save.isPending}
          icon={<CheckCircle2 className="h-4 w-4" />}
          type="submit"
          variant="primary"
        >
          {editor.mode === "create" ? t("Create target") : t("Save target")}
        </Button>
      </div>
      {save.error && (
        <div className="md:col-span-2">
          <InlineError error={save.error} />
        </div>
      )}
    </form>
  );
}

function projectPath(project: Project, projects: Project[]) {
  const byId = new Map(projects.map((item) => [item.project_id, item]));
  const path: Project[] = [];
  const visited = new Set<string>();
  let current: Project | undefined = project;
  while (current && !visited.has(current.project_id)) {
    path.unshift(current);
    visited.add(current.project_id);
    current = current.parent_project_id
      ? byId.get(current.parent_project_id)
      : undefined;
  }
  return path;
}

function agentLabel(agent: Agent | undefined, fallback: string) {
  return agent?.name ?? agent?.agent_type ?? fallback;
}

function nodeLabel(node: Node | undefined, t: Translator) {
  return node?.name ?? node?.hostname ?? t("Unknown node");
}
