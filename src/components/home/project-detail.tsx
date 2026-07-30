"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CircleOff,
  FolderPlus,
  History,
  Laptop,
  Pencil,
  Play,
  Power,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineError } from "@/components/ui/inline-error";
import {
  createProjectTarget,
  listUserSessions,
  updateProjectTarget,
  useProject,
  useProjects,
  useProjectTargets,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import type {
  Agent,
  AgentSession,
  Node,
  Project,
  ProjectTarget,
} from "@/features/api/types";
import { compactDateTime } from "@/lib/format";

type ProjectDetailProps = {
  agents: Agent[];
  nodes: Node[];
  onOpenSession: (session: AgentSession) => void;
  projectId: string;
  userId: string;
};

type TargetEditorState =
  | { mode: "create"; target?: undefined }
  | { mode: "edit"; target: ProjectTarget };

export function ProjectDetail({
  agents,
  nodes,
  onOpenSession,
  projectId,
  userId,
}: ProjectDetailProps) {
  const queryClient = useQueryClient();
  const projectQuery = useProject(userId, projectId);
  const projectsQuery = useProjects(userId);
  const targetsQuery = useProjectTargets(userId, projectId);
  const sessionsQuery = useQuery({
    queryKey: queryKeys.userSessions(userId, {
      pageSize: 10,
      primaryProjectId: projectId,
    }),
    queryFn: () =>
      listUserSessions(userId, {
        pageSize: 10,
        primaryProjectId: projectId,
      }),
  });
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
    return <ProjectDetailFrame body={<EmptyState label="Loading project" />} />;
  }

  if (projectQuery.error) {
    return (
      <ProjectDetailFrame body={<InlineError error={projectQuery.error} />} />
    );
  }

  if (!project) {
    return (
      <ProjectDetailFrame body={<EmptyState label="Project not found" />} />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-5">
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <header className="rounded-xl border border-hairline bg-surface-1 p-5">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-ink-tertiary">
            Project
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-ink">
            {project.display_name}
          </h1>
          <div className="mt-2 text-sm text-ink-tertiary">
            {path.map((item) => item.display_name).join(" / ")}
          </div>
        </header>

        <section className="rounded-xl border border-hairline bg-surface-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
            <div>
              <h2 className="font-medium text-ink">Workspace targets</h2>
              <p className="mt-1 text-sm text-ink-tertiary">
                Reuse an agent and working directory when starting sessions.
              </p>
            </div>
            <Button
              icon={<FolderPlus className="h-4 w-4" />}
              onClick={() => setEditor({ mode: "create" })}
              type="button"
            >
              Add workspace target
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
              <EmptyState label="Loading workspace targets" />
            </div>
          ) : targets.length === 0 ? (
            <div className="p-4">
              <EmptyState label="No workspace targets yet" />
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
                            <Badge tone="accent">Default</Badge>
                          )}
                          <Badge tone={target.enabled ? "success" : "neutral"}>
                            {target.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        </div>
                        <div className="mt-3 flex items-center gap-2 text-sm text-ink-muted">
                          <Laptop className="h-4 w-4 shrink-0" />
                          <span>
                            {agentLabel(agent, target.agent_id)} ·{" "}
                            {nodeLabel(node)}
                          </span>
                        </div>
                        <div className="mt-2 break-all font-mono text-xs text-ink-tertiary">
                          {target.cwd}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        aria-label={`Edit ${target.display_name}`}
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => setEditor({ mode: "edit", target })}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Edit
                      </Button>
                      {target.enabled && !target.is_default && (
                        <Button
                          aria-label={`Make ${target.display_name} default`}
                          disabled={quickUpdate.isPending}
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
                          Make default
                        </Button>
                      )}
                      <Button
                        aria-label={`${target.enabled ? "Disable" : "Enable"} ${target.display_name}`}
                        disabled={quickUpdate.isPending}
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
                        {target.enabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-hairline bg-surface-1">
          <div className="flex items-center gap-2 border-b border-hairline p-4">
            <History className="h-4 w-4 text-ink-tertiary" />
            <h2 className="font-medium text-ink">Recent sessions</h2>
          </div>
          {sessionsQuery.error ? (
            <div className="p-4">
              <InlineError error={sessionsQuery.error} />
            </div>
          ) : sessionsQuery.isLoading ? (
            <div className="p-4">
              <EmptyState label="Loading recent sessions" />
            </div>
          ) : !sessionsQuery.data?.sessions.length ? (
            <div className="p-4">
              <EmptyState label="No sessions for this project yet" />
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {sessionsQuery.data.sessions.map((session) => (
                <button
                  aria-label={`Open session ${sessionName(session)}`}
                  className="flex w-full items-center justify-between gap-4 p-4 text-left transition hover:bg-surface-2"
                  key={session.session_id}
                  onClick={() => onOpenSession(session)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">
                      {sessionName(session)}
                    </span>
                    <span className="mt-1 block truncate text-xs text-ink-tertiary">
                      {agentLabel(
                        agents.find(
                          (agent) => agent.agent_id === session.agent_id,
                        ),
                        session.agent_id,
                      )}{" "}
                      · {compactDateTime(sessionTimestamp(session))}
                    </span>
                  </span>
                  <Play className="h-4 w-4 shrink-0 text-ink-tertiary" />
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProjectDetailFrame({ body }: { body: React.ReactNode }) {
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
        Name
        <input
          aria-label="Target name"
          className="min-h-9 rounded-md border border-hairline bg-surface-1 px-2.5 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setName(event.target.value)}
          placeholder="Local workspace"
          value={name}
        />
      </label>
      <label className="grid gap-1 text-xs text-ink-tertiary">
        Agent
        <select
          aria-label="Target agent"
          className="min-h-9 rounded-md border border-hairline bg-surface-1 px-2.5 text-sm text-ink outline-none focus:border-primary-focus"
          onChange={(event) => setAgentId(event.target.value)}
          value={agentId}
        >
          <option value="">Select an agent</option>
          {agents.map((agent) => (
            <option key={agent.agent_id} value={agent.agent_id}>
              {agentLabel(agent, agent.agent_id)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-ink-tertiary md:col-span-2">
        Workspace
        <input
          aria-label="Target workspace"
          className="min-h-9 rounded-md border border-hairline bg-surface-1 px-2.5 font-mono text-sm text-ink outline-none focus:border-primary-focus"
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
          Make default
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            type="checkbox"
          />
          Enabled
        </label>
      </div>
      <div className="flex justify-end gap-2 md:col-span-2">
        <Button onClick={onCancel} type="button" variant="ghost">
          Cancel
        </Button>
        <Button
          disabled={!name.trim() || !cwd.trim() || !agentId || save.isPending}
          icon={<CheckCircle2 className="h-4 w-4" />}
          type="submit"
          variant="primary"
        >
          {editor.mode === "create" ? "Create target" : "Save target"}
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

function nodeLabel(node: Node | undefined) {
  return node?.name ?? node?.hostname ?? "Unknown node";
}

function sessionName(session: AgentSession) {
  return session.name ?? session.current_task ?? session.session_id;
}

function sessionTimestamp(session: AgentSession) {
  return (
    session.last_user_message_at ??
    session.last_message_at ??
    session.updated_at ??
    session.last_active_at
  );
}
