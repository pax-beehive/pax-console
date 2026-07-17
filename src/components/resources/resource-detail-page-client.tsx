"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Save,
  Server,
  Trash2,
  Undo2,
} from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MonoId, TruncatedText } from "@/components/ui/text";
import {
  deleteAgent,
  deleteNode,
  deleteNodeAgent,
  updateNodeAgentProfile,
  updateNodeProfile,
  useAgent,
  useAgentSessions,
  useNode,
  useNodeAgents,
  useNodes,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import { Agent, ApiRecord, Node, User } from "@/features/api/types";
import { compactId } from "@/lib/format";
import { nodeLabel } from "./resource-models";
import { NodeDaemonControl } from "./node-daemon-control";

type NodeDetailPageClientProps = {
  nodeId: string;
  user: User;
};

type AgentDetailPageClientProps = {
  agentId: string;
  nodeId?: string;
  user: User;
};

export function NodeDetailPageClient({
  nodeId,
  user,
}: NodeDetailPageClientProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [nodeDeleteOpen, setNodeDeleteOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);
  const nodesQuery = useNodes(user.user_id);
  const nodeQuery = useNode(user.user_id, nodeId);
  const agentsQuery = useNodeAgents(user.user_id, nodeId);
  const nodes = nodesQuery.data?.nodes ?? [];
  const node = nodeQuery.data;
  const agents = agentsQuery.data?.agents ?? [];
  const removeNode = useMutation({
    mutationFn: () => deleteNode(user.user_id, nodeId),
    onSuccess: () => {
      setNodeDeleteOpen(false);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.user(user.user_id),
      });
      router.push("/nodes");
    },
  });
  const removeNodeAgent = useMutation({
    mutationFn: (agent: Agent) =>
      deleteNodeAgent(user.user_id, nodeId, agent.agent_id),
    onSuccess: () => {
      setAgentToDelete(null);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.user(user.user_id),
      });
    },
  });

  return (
    <ConsoleLayout activeNode={node} nodes={nodes} user={user}>
      <DetailShell
        backHref="/nodes"
        error={nodeQuery.error ?? agentsQuery.error}
        eyebrow="node detail"
        icon={<Server className="h-4 w-4" />}
        title={node?.name ?? node?.hostname ?? nodeId}
      >
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <NodeProfileEditor node={node} userId={user.user_id} />
          <div className="grid min-w-0 gap-4">
            <DetailCard
              rows={[
                ["Node ID", node?.node_id ?? nodeId],
                ["Status", nodeStatus(node)],
                ["Host", node?.hostname ?? "unknown"],
                ["OS", `${node?.os ?? "unknown"} / ${node?.arch ?? "unknown"}`],
                ["Machine", node?.machine_type ?? "unknown"],
                ["paxd", node?.paxd_version ?? "unknown"],
                ["API endpoint", node?.api_endpoint ?? "unknown"],
                ["Last heartbeat", node?.last_heartbeat ?? "unknown"],
                ["Registered", node?.registered_at ?? "unknown"],
              ]}
              title="Runtime"
            />
            <MetadataCard title="System metadata" value={node?.metadata} />
          </div>
        </div>

        <NodeDaemonControl nodeId={nodeId} userId={user.user_id} />

        <section className="grid gap-3">
          <SectionHeader count={agents.length} title="Agents on this node" />
          {removeNodeAgent.error && (
            <Notice
              message={`${removeNodeAgent.error.name}: ${removeNodeAgent.error.message}`}
            />
          )}
          <div className="grid min-w-0 overflow-hidden rounded-lg border border-hairline">
            {agents.map((agent) => (
              <article
                className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 transition last:border-b-0 hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_180px_120px_40px]"
                key={agent.agent_id}
              >
                <Link
                  className="contents"
                  href={`/agents/${agent.agent_id}?nodeId=${nodeId}`}
                >
                  <div className="min-w-0">
                    <TruncatedText className="text-base font-medium">
                      {agent.name ?? agent.agent_type ?? agent.agent_id}
                    </TruncatedText>
                    {agent.description && (
                      <TruncatedText className="mt-1 text-sm text-ink-muted">
                        {agent.description}
                      </TruncatedText>
                    )}
                  </div>
                  <MonoId tooltip={agent.agent_id}>
                    {compactId(agent.agent_id)}
                  </MonoId>
                  <div className="flex items-start sm:justify-end">
                    <Badge>{agent.status ?? "unknown"}</Badge>
                  </div>
                </Link>
                <div className="flex items-start justify-end">
                  <ConfirmDialog
                    confirmLabel={
                      removeNodeAgent.isPending ? "Deleting..." : "Delete agent"
                    }
                    description={
                      <>
                        This removes{" "}
                        <span className="font-medium text-ink">
                          {agentToDelete?.name ??
                            agentToDelete?.agent_type ??
                            agentToDelete?.agent_id}
                        </span>{" "}
                        from this node. Other agents on the node are not
                        affected.
                      </>
                    }
                    disabled={removeNodeAgent.isPending}
                    onConfirm={() => {
                      if (agentToDelete) {
                        removeNodeAgent.mutate(agentToDelete);
                      }
                    }}
                    onOpenChange={(open) => {
                      if (!open) {
                        setAgentToDelete(null);
                      }
                    }}
                    open={agentToDelete?.agent_id === agent.agent_id}
                    title="Delete agent?"
                  >
                    <Button
                      disabled={removeNodeAgent.isPending}
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => setAgentToDelete(agent)}
                      size="icon"
                      tooltip="Delete hosted agent"
                      type="button"
                      variant="danger"
                    />
                  </ConfirmDialog>
                </div>
              </article>
            ))}
          </div>
        </section>

        <CleanupActionCard
          actionLabel={removeNode.isPending ? "Deleting..." : "Delete node"}
          description="This removes the node from the fleet view and cleans up agents hosted on this node."
          disabled={!node || removeNode.isPending}
          error={removeNode.error}
          onDelete={() => setNodeDeleteOpen(true)}
          title="Cleanup node"
        />
        <ConfirmDialog
          confirmLabel={removeNode.isPending ? "Deleting..." : "Delete node"}
          description={
            <>
              This removes{" "}
              <span className="font-medium text-ink">
                {node?.name ?? node?.hostname ?? nodeId}
              </span>{" "}
              from the fleet view. Agents hosted on this node will be cleaned up
              at the same time.
            </>
          }
          disabled={!node || removeNode.isPending}
          onConfirm={() => removeNode.mutate()}
          onOpenChange={setNodeDeleteOpen}
          open={nodeDeleteOpen}
          title="Delete node?"
        />
      </DetailShell>
    </ConsoleLayout>
  );
}

export function AgentDetailPageClient({
  agentId,
  nodeId,
  user,
}: AgentDetailPageClientProps) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [agentDeleteOpen, setAgentDeleteOpen] = useState(false);
  const nodesQuery = useNodes(user.user_id);
  const nodes = nodesQuery.data?.nodes ?? [];
  const agentQuery = useAgent(user.user_id, agentId);
  const agent = agentQuery.data;
  const activeNodeId = agent?.node_id ?? nodeId;
  const node = nodes.find((candidate) => candidate.node_id === activeNodeId);
  const sessionsQuery = useAgentSessions(user.user_id, activeNodeId, agentId);
  const sessions = sessionsQuery.data?.sessions ?? [];
  const removeAgent = useMutation({
    mutationFn: () => deleteAgent(user.user_id, agentId),
    onSuccess: () => {
      setAgentDeleteOpen(false);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.user(user.user_id),
      });
      router.push("/agents");
    },
  });

  return (
    <ConsoleLayout
      activeAgent={agent}
      activeNode={node}
      nodes={nodes}
      user={user}
    >
      <DetailShell
        backHref="/agents"
        error={agentQuery.error ?? sessionsQuery.error}
        eyebrow="agent detail"
        icon={<Bot className="h-4 w-4" />}
        title={agent?.name ?? agent?.agent_type ?? agentId}
      >
        {!activeNodeId && (
          <Notice message="Agent runtime node is not loaded yet. Sessions and profile edits will appear once the agent detail is available." />
        )}

        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <AgentProfileEditor agent={agent} userId={user.user_id} />
          <div className="grid min-w-0 gap-4">
            <DetailCard
              rows={[
                ["Agent ID", agent?.agent_id ?? agentId],
                [
                  "Node",
                  node
                    ? nodeLabel(node)
                    : (agent?.node_id ?? activeNodeId ?? "unknown"),
                ],
                ["Node ID", agent?.node_id ?? activeNodeId ?? "unknown"],
                ["Type", agent?.agent_type ?? "unknown"],
                ["Status", agentStatus(agent)],
                ["Last heartbeat", agent?.last_heartbeat ?? "unknown"],
                ["Registered", agent?.registered_at ?? "unknown"],
              ]}
              title="Runtime"
            />
            <MetadataCard title="Capabilities" value={agent?.capabilities} />
            <MetadataCard title="System metadata" value={agent?.metadata} />
          </div>
        </div>

        <section className="grid gap-3">
          <SectionHeader count={sessions.length} title="Recent sessions" />
          <div className="grid min-w-0 overflow-hidden rounded-lg border border-hairline">
            {sessions.map((session) => (
              <Link
                className="grid min-w-0 gap-3 border-b border-hairline bg-surface-1 px-3 py-2.5 transition last:border-b-0 hover:bg-surface-2 lg:grid-cols-[minmax(0,1fr)_120px]"
                href={`/sessions/${session.session_id}?nodeId=${session.node_id}&agentId=${session.agent_id}`}
                key={session.session_id}
              >
                <div className="min-w-0">
                  <TruncatedText className="text-base font-medium">
                    {session.name ?? session.current_task ?? session.session_id}
                  </TruncatedText>
                  <TruncatedText className="mt-1 text-sm text-ink-muted">
                    {session.preview ?? session.current_task ?? "Open session"}
                  </TruncatedText>
                </div>
                <div className="flex items-start lg:justify-end">
                  <Badge>
                    {session.run_status ?? session.status ?? "unknown"}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <CleanupActionCard
          actionLabel={removeAgent.isPending ? "Deleting..." : "Delete agent"}
          description="This removes the agent from the agents list. Existing sessions remain as history."
          disabled={!agent || removeAgent.isPending}
          error={removeAgent.error}
          onDelete={() => setAgentDeleteOpen(true)}
          title="Cleanup agent"
        />
        <ConfirmDialog
          confirmLabel={removeAgent.isPending ? "Deleting..." : "Delete agent"}
          description={
            <>
              This removes{" "}
              <span className="font-medium text-ink">
                {agent?.name ?? agent?.agent_type ?? agentId}
              </span>{" "}
              from the agents list. Other agents on the same node are not
              affected.
            </>
          }
          disabled={!agent || removeAgent.isPending}
          onConfirm={() => removeAgent.mutate()}
          onOpenChange={setAgentDeleteOpen}
          open={agentDeleteOpen}
          title="Delete agent?"
        />
      </DetailShell>
    </ConsoleLayout>
  );
}

function NodeProfileEditor({ node, userId }: { node?: Node; userId: string }) {
  return (
    <NodeProfileForm
      initialDescription={node?.description ?? ""}
      initialName={node?.name ?? ""}
      initialUserMetadata={asRecord(node?.user_metadata)}
      key={node?.node_id ?? "pending-node"}
      node={node}
      userId={userId}
    />
  );
}

function NodeProfileForm({
  initialDescription,
  initialName,
  initialUserMetadata,
  node,
  userId,
}: {
  initialDescription: string;
  initialName: string;
  initialUserMetadata: ApiRecord;
  node?: Node;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [baseUserMetadata, setBaseUserMetadata] = useState(initialUserMetadata);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [labels, setLabels] = useState(formatList(initialUserMetadata.labels));
  const [notes, setNotes] = useState(stringValue(initialUserMetadata.notes));
  const [routingHint, setRoutingHint] = useState(
    stringValue(initialUserMetadata.routing_hint),
  );

  const save = useMutation({
    mutationFn: () => {
      if (!node) {
        throw new Error("Node is not loaded.");
      }
      return updateNodeProfile(userId, node.node_id, {
        description: blankAsUndefined(description),
        name: blankAsUndefined(name),
        user_metadata: buildUserMetadata(baseUserMetadata, {
          labels,
          notes,
          routingHint,
        }),
      });
    },
    onSuccess: (updated) => {
      const updatedUserMetadata = asRecord(updated.user_metadata);
      setBaseUserMetadata(updatedUserMetadata);
      setName(updated.name ?? "");
      setDescription(updated.description ?? "");
      setLabels(formatList(updatedUserMetadata.labels));
      setNotes(stringValue(updatedUserMetadata.notes));
      setRoutingHint(stringValue(updatedUserMetadata.routing_hint));
      void queryClient.invalidateQueries({ queryKey: queryKeys.nodes(userId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.node(userId, updated.node_id),
      });
    },
  });

  const reset = () => {
    setName(initialName);
    setDescription(initialDescription);
    setLabels(formatList(initialUserMetadata.labels));
    setNotes(stringValue(initialUserMetadata.notes));
    setRoutingHint(stringValue(initialUserMetadata.routing_hint));
  };

  return (
    <ProfileForm
      disabled={!node || save.isPending}
      error={save.error}
      onReset={reset}
      onSave={() => save.mutate()}
      title="Profile"
    >
      <TextField
        disabled={!node || save.isPending}
        label="Name"
        onChange={setName}
        placeholder="desk mac"
        value={name}
      />
      <TextAreaField
        disabled={!node || save.isPending}
        label="Description"
        onChange={setDescription}
        placeholder="Main development workstation"
        value={description}
      />
      <TextField
        disabled={!node || save.isPending}
        label="Labels"
        onChange={setLabels}
        placeholder="primary, local"
        value={labels}
      />
      <TextAreaField
        disabled={!node || save.isPending}
        label="Notes"
        onChange={setNotes}
        placeholder="Use this machine for local builds"
        value={notes}
      />
      <TextField
        disabled={!node || save.isPending}
        label="Routing hint"
        onChange={setRoutingHint}
        placeholder="prefer for local tasks"
        value={routingHint}
      />
    </ProfileForm>
  );
}

function AgentProfileEditor({
  agent,
  userId,
}: {
  agent?: Agent;
  userId: string;
}) {
  return (
    <AgentProfileForm
      agent={agent}
      initialCard={asRecord(agent?.card)}
      initialDescription={agent?.description ?? ""}
      initialName={agent?.name ?? ""}
      initialUserMetadata={asRecord(agent?.user_metadata)}
      key={agent?.agent_id ?? "pending-agent"}
      userId={userId}
    />
  );
}

function AgentProfileForm({
  agent,
  initialCard,
  initialDescription,
  initialName,
  initialUserMetadata,
  userId,
}: {
  agent?: Agent;
  initialCard: ApiRecord;
  initialDescription: string;
  initialName: string;
  initialUserMetadata: ApiRecord;
  userId: string;
}) {
  const queryClient = useQueryClient();
  const [baseCard, setBaseCard] = useState(initialCard);
  const [baseUserMetadata, setBaseUserMetadata] = useState(initialUserMetadata);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [routingTags, setRoutingTags] = useState(
    formatList(initialCard.routing_tags),
  );
  const [skills, setSkills] = useState(formatList(initialCard.skills));
  const [specialties, setSpecialties] = useState(
    formatList(initialCard.specialties),
  );
  const [capabilityNotes, setCapabilityNotes] = useState(
    stringValue(initialCard.capability_notes),
  );
  const [labels, setLabels] = useState(formatList(initialUserMetadata.labels));
  const [notes, setNotes] = useState(stringValue(initialUserMetadata.notes));
  const [routingHint, setRoutingHint] = useState(
    stringValue(initialUserMetadata.routing_hint),
  );

  const save = useMutation({
    mutationFn: () => {
      if (!agent) {
        throw new Error("Agent is not loaded.");
      }
      return updateNodeAgentProfile(userId, agent.node_id, agent.agent_id, {
        card: buildAgentCard(baseCard, {
          capabilityNotes,
          routingTags,
          skills,
          specialties,
        }),
        description: blankAsUndefined(description),
        name: blankAsUndefined(name),
        user_metadata: buildUserMetadata(baseUserMetadata, {
          labels,
          notes,
          routingHint,
        }),
      });
    },
    onSuccess: (updated) => {
      const updatedCard = asRecord(updated.card);
      const updatedUserMetadata = asRecord(updated.user_metadata);
      setBaseCard(updatedCard);
      setBaseUserMetadata(updatedUserMetadata);
      setName(updated.name ?? "");
      setDescription(updated.description ?? "");
      setRoutingTags(formatList(updatedCard.routing_tags));
      setSkills(formatList(updatedCard.skills));
      setSpecialties(formatList(updatedCard.specialties));
      setCapabilityNotes(stringValue(updatedCard.capability_notes));
      setLabels(formatList(updatedUserMetadata.labels));
      setNotes(stringValue(updatedUserMetadata.notes));
      setRoutingHint(stringValue(updatedUserMetadata.routing_hint));
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents(userId, updated.node_id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agent(userId, updated.node_id, updated.agent_id),
      });
    },
  });

  const reset = () => {
    setName(initialName);
    setDescription(initialDescription);
    setRoutingTags(formatList(initialCard.routing_tags));
    setSkills(formatList(initialCard.skills));
    setSpecialties(formatList(initialCard.specialties));
    setCapabilityNotes(stringValue(initialCard.capability_notes));
    setLabels(formatList(initialUserMetadata.labels));
    setNotes(stringValue(initialUserMetadata.notes));
    setRoutingHint(stringValue(initialUserMetadata.routing_hint));
  };

  return (
    <ProfileForm
      disabled={!agent || save.isPending}
      error={save.error}
      onReset={reset}
      onSave={() => save.mutate()}
      title="Profile"
    >
      <TextField
        disabled={!agent || save.isPending}
        label="Name"
        onChange={setName}
        placeholder="reviewer"
        value={name}
      />
      <TextAreaField
        disabled={!agent || save.isPending}
        label="Description"
        onChange={setDescription}
        placeholder="Reviews risky changes"
        value={description}
      />
      <TextField
        disabled={!agent || save.isPending}
        label="Routing tags"
        onChange={setRoutingTags}
        placeholder="review, backend"
        value={routingTags}
      />
      <TextField
        disabled={!agent || save.isPending}
        label="Skills"
        onChange={setSkills}
        placeholder="review, tests"
        value={skills}
      />
      <TextField
        disabled={!agent || save.isPending}
        label="Specialties"
        onChange={setSpecialties}
        placeholder="api, postgres"
        value={specialties}
      />
      <TextAreaField
        disabled={!agent || save.isPending}
        label="Capability notes"
        onChange={setCapabilityNotes}
        placeholder="Strong at risky API and migration reviews"
        value={capabilityNotes}
      />
      <TextField
        disabled={!agent || save.isPending}
        label="Labels"
        onChange={setLabels}
        placeholder="favorite, local"
        value={labels}
      />
      <TextAreaField
        disabled={!agent || save.isPending}
        label="Notes"
        onChange={setNotes}
        placeholder="Use before merging backend changes"
        value={notes}
      />
      <TextField
        disabled={!agent || save.isPending}
        label="Routing hint"
        onChange={setRoutingHint}
        placeholder="prefer for API changes"
        value={routingHint}
      />
    </ProfileForm>
  );
}

function ProfileForm({
  children,
  disabled,
  error,
  onReset,
  onSave,
  title,
}: {
  children: React.ReactNode;
  disabled: boolean;
  error: Error | null;
  onReset: () => void;
  onSave: () => void;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-base font-medium">{title}</h2>
        <div className="flex shrink-0 gap-2">
          <Button
            disabled={disabled}
            icon={<Undo2 className="h-4 w-4" />}
            onClick={onReset}
            size="icon"
            tooltip="Reset profile form"
            type="button"
            variant="ghost"
          />
          <Button
            disabled={disabled}
            icon={<Save className="h-4 w-4" />}
            onClick={onSave}
            size="icon"
            tooltip="Save profile"
            type="button"
            variant="primary"
          />
        </div>
      </div>
      <div className="mt-3 grid min-w-0 gap-3">{children}</div>
      {error && (
        <div className="mt-3 rounded-lg border border-warning bg-canvas p-2 text-xs text-ink-muted">
          {error.message}
        </div>
      )}
    </section>
  );
}

function CleanupActionCard({
  actionLabel,
  description,
  disabled,
  error,
  onDelete,
  title,
}: {
  actionLabel: string;
  description: string;
  disabled: boolean;
  error: Error | null;
  onDelete: () => void;
  title: string;
}) {
  return (
    <section className="min-w-0 rounded-lg border border-warning bg-surface-1 p-3">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-muted">{description}</p>
        </div>
        <Button
          disabled={disabled}
          icon={<Trash2 className="h-4 w-4" />}
          onClick={onDelete}
          type="button"
          variant="danger"
        >
          {actionLabel}
        </Button>
      </div>
      {error && (
        <div className="mt-3 rounded-lg border border-warning bg-canvas p-2 text-xs text-ink-muted">
          {error.message}
        </div>
      )}
    </section>
  );
}

function TextField({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
      {label}
      <input
        className="min-h-9 rounded-lg border border-hairline bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-ink-tertiary focus:border-hairline-strong"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function TextAreaField({
  disabled,
  label,
  onChange,
  placeholder,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-ink-tertiary">
      {label}
      <textarea
        className="min-h-24 resize-y rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink outline-none transition placeholder:text-ink-tertiary focus:border-hairline-strong"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function DetailShell({
  backHref,
  children,
  error,
  eyebrow,
  icon,
  title,
}: {
  backHref: string;
  children: React.ReactNode;
  error: Error | null;
  eyebrow: string;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain p-5">
      <header className="flex items-center justify-between border-b border-hairline pb-4">
        <div className="min-w-0">
          <Link
            className="inline-flex items-center gap-2 text-sm text-ink-subtle hover:text-ink"
            href={backHref}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="mt-4 flex items-center gap-2 text-sm text-ink-tertiary">
            {icon}
            {eyebrow}
          </div>
          <TruncatedText className="mt-2 max-w-[60vw] text-2xl font-semibold">
            {title}
          </TruncatedText>
        </div>
      </header>
      {error && <Notice message={`${error.name}: ${error.message}`} />}
      {children}
    </div>
  );
}

function DetailCard({ rows, title }: { rows: string[][]; title: string }) {
  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
      <h2 className="text-base font-medium">{title}</h2>
      <div className="mt-3 grid overflow-hidden rounded-md border border-hairline">
        {rows.map(([label, value]) => (
          <div
            className="grid min-w-0 grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-hairline px-3 py-2 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]"
            key={label}
          >
            <TruncatedText className="text-xs text-ink-tertiary">
              {label}
            </TruncatedText>
            <MonoId className="text-ink-muted" tooltip={value}>
              {value.startsWith("node_") ||
              value.startsWith("agent_") ||
              value.startsWith("sess_")
                ? compactId(value)
                : value}
            </MonoId>
          </div>
        ))}
      </div>
    </section>
  );
}

function MetadataCard({ title, value }: { title: string; value?: unknown }) {
  const entries = Object.entries(asRecord(value));

  return (
    <section className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
      <h2 className="text-base font-medium">{title}</h2>
      {entries.length === 0 ? (
        <div className="mt-3 rounded-md border border-dashed border-hairline bg-canvas p-3 text-sm text-ink-tertiary">
          No data reported
        </div>
      ) : (
        <div className="mt-3 grid overflow-hidden rounded-md border border-hairline">
          {entries.map(([key, entryValue]) => (
            <div
              className="grid min-w-0 grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-hairline px-3 py-2 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)]"
              key={key}
            >
              <TruncatedText className="text-xs text-ink-tertiary">
                {humanizeKey(key)}
              </TruncatedText>
              <MetadataValue value={entryValue} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MetadataValue({ value }: { value: unknown }) {
  if (isScalar(value)) {
    const text = String(value);
    return (
      <TruncatedText className="text-sm text-ink-muted" tooltip={text}>
        {text}
      </TruncatedText>
    );
  }

  if (Array.isArray(value) && value.every(isScalar)) {
    if (value.length === 0) {
      return (
        <TruncatedText className="text-sm text-ink-tertiary">
          Empty
        </TruncatedText>
      );
    }

    return (
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {value.map((item, index) => (
          <Badge className="max-w-48" key={`${String(item)}-${index}`}>
            {String(item)}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <details className="min-w-0 text-xs text-ink-muted">
      <summary className="cursor-pointer text-ink-subtle">
        {Array.isArray(value) ? `${value.length} items` : "Object"}
      </summary>
      <pre className="mt-2 max-h-56 max-w-full overflow-auto rounded-md border border-hairline bg-canvas p-2 leading-6">
        {JSON.stringify(value ?? {}, null, 2)}
      </pre>
    </details>
  );
}

function SectionHeader({ count, title }: { count: number; title: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <TruncatedText className="text-base font-medium">{title}</TruncatedText>
      <Badge className="font-mono">{String(count)}</Badge>
    </div>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-3 text-sm text-ink-muted">
      <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
      <div className="min-w-0">
        <div className="font-medium text-ink">Detail request notice</div>
        <TruncatedText className="mt-1 font-mono text-xs text-ink-tertiary">
          {message}
        </TruncatedText>
      </div>
    </div>
  );
}

function nodeStatus(node?: Node) {
  return node?.status ?? (node?.online ? "online" : "offline");
}

function agentStatus(agent?: Agent) {
  return agent?.status ?? (agent?.online ? "online" : "offline");
}

function humanizeKey(key: string) {
  return key
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isScalar(value: unknown): value is boolean | number | string {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

function blankAsUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function asRecord(value?: unknown): ApiRecord {
  return value && !Array.isArray(value) && typeof value === "object"
    ? { ...(value as ApiRecord) }
    : {};
}

function buildAgentCard(
  base: ApiRecord,
  input: {
    capabilityNotes: string;
    routingTags: string;
    skills: string;
    specialties: string;
  },
) {
  const next = { ...base };
  writeListField(next, "routing_tags", input.routingTags);
  writeListField(next, "skills", input.skills);
  writeListField(next, "specialties", input.specialties);
  writeStringField(next, "capability_notes", input.capabilityNotes);
  return next;
}

function buildUserMetadata(
  base: ApiRecord,
  input: {
    labels: string;
    notes: string;
    routingHint: string;
  },
) {
  const next = { ...base };
  writeListField(next, "labels", input.labels);
  writeStringField(next, "notes", input.notes);
  writeStringField(next, "routing_hint", input.routingHint);
  return next;
}

function formatList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  }

  return typeof value === "string" ? value : "";
}

function splitList(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function writeListField(record: ApiRecord, key: string, value: string) {
  const items = splitList(value);
  if (items.length > 0) {
    record[key] = items;
  } else {
    delete record[key];
  }
}

function writeStringField(record: ApiRecord, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) {
    record[key] = trimmed;
  } else {
    delete record[key];
  }
}
