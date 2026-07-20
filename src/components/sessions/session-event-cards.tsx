import { memo, type MouseEvent, useCallback, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileCode,
  LoaderCircle,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { PaxLogo } from "@/components/ui/pax-logo";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { AgentOwnerInfo } from "@/features/api/types";
import {
  PermissionDecision,
  permissionRequestCodePatches,
  SessionEvent,
  toolCallAppliedPatches,
  toolCallProposedPatches,
  ToolCallEvent,
  WorkActivityEvent,
  WorkstreamItem,
} from "@/features/runtime/session-events";
import { invocationBodyContent } from "@/features/runtime/invocation-body-content";
import { CodePatch, codePatchToText } from "@/features/runtime/tool-patches";
import { cn } from "@/lib/utils";

export type PermissionDecisionOption =
  | "deny"
  | "allow_once"
  | "allow_for_this_agent"
  | "allow_for_this_node"
  | "allow_always_on_all_agents";

export type PermissionDecisionState = {
  decisions: Record<string, PermissionDecisionResult>;
  error: Error | null;
  onDecision: (
    approvalId: string,
    decisionOption: PermissionDecisionOption,
  ) => void;
  pending: boolean;
  pendingApprovalId?: string;
};

export type PermissionDecisionResult = PermissionDecision;

export type ToolEvidenceSelection =
  | {
      type: "tool";
      event: ToolCallEvent;
    }
  | {
      type: "permission";
      event: Extract<SessionEvent, { type: "permission_request" }>;
    };

type WorkstreamItemCardProps = {
  agentOwnerInfos?: Record<string, AgentOwnerInfo>;
  item: WorkstreamItem;
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  permissionDecision: PermissionDecisionState;
};

const permissionDecisionOptions: {
  label: string;
  optionId: PermissionDecisionOption;
  variant: "primary" | "secondary" | "danger";
}[] = [
  { label: "Deny", optionId: "deny", variant: "danger" },
  { label: "Allow once", optionId: "allow_once", variant: "primary" },
  {
    label: "This agent",
    optionId: "allow_for_this_agent",
    variant: "secondary",
  },
  {
    label: "This node",
    optionId: "allow_for_this_node",
    variant: "secondary",
  },
  {
    label: "All agents",
    optionId: "allow_always_on_all_agents",
    variant: "secondary",
  },
];

export const WorkstreamItemCard = memo(function WorkstreamItemCard({
  agentOwnerInfos,
  item,
  onSelectToolEvidence,
  permissionDecision,
}: WorkstreamItemCardProps) {
  if (item.type === "work_group") {
    return (
      <WorkGroupCard
        complete={item.complete}
        events={item.events}
        onSelectToolEvidence={onSelectToolEvidence}
        permissionDecision={permissionDecision}
      />
    );
  }

  if (item.type === "turn_footer") {
    return (
      <TurnFooterCard
        actionsContent={item.actionsContent}
        turnPatches={item.turnPatches}
      />
    );
  }

  return (
    <EventCard
      agentOwnerInfos={agentOwnerInfos}
      event={item.event}
      onSelectToolEvidence={onSelectToolEvidence}
      permissionDecision={permissionDecision}
    />
  );
}, areWorkstreamItemCardPropsEqual);

function areWorkstreamItemCardPropsEqual(
  previous: WorkstreamItemCardProps,
  next: WorkstreamItemCardProps,
) {
  return (
    previous.agentOwnerInfos === next.agentOwnerInfos &&
    previous.onSelectToolEvidence === next.onSelectToolEvidence &&
    previous.permissionDecision === next.permissionDecision &&
    areWorkstreamItemsEqual(previous.item, next.item)
  );
}

function areWorkstreamItemsEqual(
  previous: WorkstreamItem,
  next: WorkstreamItem,
) {
  if (previous === next) {
    return true;
  }
  if (previous.type !== next.type || previous.id !== next.id) {
    return false;
  }
  if (previous.type === "event" && next.type === "event") {
    return previous.event === next.event;
  }
  if (previous.type === "work_group" && next.type === "work_group") {
    return (
      previous.complete === next.complete &&
      previous.events.length === next.events.length &&
      previous.events.every((event, index) => event === next.events[index])
    );
  }
  if (previous.type === "turn_footer" && next.type === "turn_footer") {
    return (
      previous.actionsContent === next.actionsContent &&
      previous.turnPatches === next.turnPatches
    );
  }
  return false;
}

export function ToolEvidencePanel({
  permissionDecision,
  selection,
}: {
  permissionDecision: PermissionDecisionState;
  selection: ToolEvidenceSelection | null;
}) {
  if (!selection) {
    return (
      <div className="rounded-lg border border-dashed border-hairline bg-canvas p-3 text-sm text-ink-tertiary">
        Select a tool call or approval request from the timeline.
      </div>
    );
  }

  if (selection.type === "permission") {
    const patches = permissionRequestPatches(selection.event);
    return (
      <div className="grid gap-4">
        <PermissionRequestCard
          compactApproved={false}
          event={selection.event}
          permissionDecision={permissionDecision}
        />
        {patches.length > 0 && <ToolEvidencePatchList patches={patches} />}
        <ToolPayloadSection label="Request" value={selection.event.rawInput} />
      </div>
    );
  }

  const event = selection.event;
  const appliedPatches = toolCallAppliedPatches(event);
  const proposedPatches = toolCallProposedPatches(event);
  const codePatches =
    appliedPatches.length > 0 ? appliedPatches : proposedPatches;

  return (
    <div className="grid gap-4">
      <section className="grid gap-2 rounded-lg border border-hairline bg-canvas p-3">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <TruncatedText
            className="font-mono text-xs font-medium text-ink"
            tooltip={event.name}
          >
            {event.name}
          </TruncatedText>
          <ToolStatusBadge status={event.status} />
        </div>
        {event.toolCallId && <MonoId>tool: {event.toolCallId}</MonoId>}
        {event.durationMs !== undefined && (
          <div className="text-xs text-ink-tertiary">{event.durationMs}ms</div>
        )}
      </section>

      {codePatches.length > 0 && (
        <ToolEvidencePatchList patches={codePatches} />
      )}

      <ToolPermissionsSection
        event={event}
        permissionDecision={permissionDecision}
      />
      <ToolPayloadSection label="Input" value={event.input} />
      <ToolPayloadSection
        fallback={event.status === "done" ? "Success" : undefined}
        label="Output"
        value={event.output}
      />
    </div>
  );
}

function EventCard({
  agentOwnerInfos,
  event,
  onSelectToolEvidence,
  permissionDecision,
}: {
  agentOwnerInfos?: Record<string, AgentOwnerInfo>;
  event: SessionEvent;
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  permissionDecision: PermissionDecisionState;
}) {
  if (event.type === "file_change") {
    return <FileChangeCard event={event} />;
  }

  if (event.type === "progress") {
    return <ThoughtCard event={event} />;
  }

  if (event.type === "tool_call") {
    return (
      <ToolGroupCard
        events={[event]}
        onSelectToolEvidence={onSelectToolEvidence}
        permissionDecision={permissionDecision}
      />
    );
  }

  if (event.type === "permission_request") {
    return (
      <PermissionRequestCard
        event={event}
        onSelectToolEvidence={onSelectToolEvidence}
        permissionDecision={permissionDecision}
      />
    );
  }

  if (event.type === "user_message") {
    return <UserMessageCard event={event} />;
  }

  if (event.type === "agent_message") {
    return <AgentMessageCard event={event} />;
  }

  if (event.type === "invocation") {
    return <InvocationCard agentOwnerInfos={agentOwnerInfos} event={event} />;
  }

  return null;
}

function FileChangeCard({
  event,
}: {
  event: Extract<SessionEvent, { type: "file_change" }>;
}) {
  return (
    <article className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-ink-tertiary">
        <FileCode className="h-4 w-4" />
        file change
      </div>
      <MonoId className="mt-2 text-sm text-ink" tooltip={event.path}>
        {event.path}
      </MonoId>
    </article>
  );
}

// Shown after the user sends a prompt until the first agent output streams
// in. Keep it quiet: a breathing PAX mark plus three pulsing dots.
export function AgentPendingIndicator() {
  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2 py-1"
      role="status"
    >
      <motion.span
        animate={{ opacity: [0.35, 1, 0.35], scale: [0.88, 1, 0.88] }}
        className="flex shrink-0"
        transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
      >
        <PaxLogo className="h-4 w-4 text-accent-bright" />
      </motion.span>
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((index) => (
          <motion.span
            animate={{ opacity: [0.25, 1, 0.25] }}
            className="h-1 w-1 rounded-full bg-ink-tertiary"
            key={index}
            transition={{
              delay: index * 0.2,
              duration: 1.2,
              ease: "easeInOut",
              repeat: Infinity,
            }}
          />
        ))}
      </span>
    </div>
  );
}

function ThoughtCard({
  event,
}: {
  event: Extract<SessionEvent, { type: "progress" }>;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <details
      className="group min-w-0 py-1"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-ink-muted outline-none transition hover:text-ink [&::-webkit-details-marker]:hidden">
        <PaxThoughtIcon />
        <span>{event.streaming ? "思考中" : "已思考"}</span>
        <ChevronDown className="ml-auto h-3.5 w-3.5 -rotate-90 text-ink-tertiary transition group-open:rotate-0" />
      </summary>
      {expanded && (
        <MarkdownMessage
          className="mt-2 pl-1 text-[13px] leading-5"
          content={event.content}
          muted
          streaming={event.streaming}
        />
      )}
    </details>
  );
}

function UserMessageCard({
  event,
}: {
  event: Extract<SessionEvent, { type: "user_message" }>;
}) {
  return (
    <article className="flex min-w-0 justify-end py-1">
      <div className="w-fit max-w-[min(72%,640px)] min-w-0 rounded-lg bg-surface-2 px-3 py-2">
        <MarkdownMessage
          className="overflow-hidden text-sm leading-5 text-ink"
          content={event.content}
        />
      </div>
    </article>
  );
}

function AgentMessageCard({
  event,
}: {
  event: Extract<SessionEvent, { type: "agent_message" }>;
}) {
  return (
    <article className="min-w-0 justify-self-stretch py-0">
      <MarkdownMessage
        className="text-sm leading-5 text-ink"
        content={event.content}
        streaming={event.streaming}
      />
    </article>
  );
}

function TurnFooterCard({
  actionsContent,
  turnPatches,
}: {
  actionsContent?: string;
  turnPatches?: CodePatch[];
}) {
  const shouldShowTurnPatches = (turnPatches?.length ?? 0) > 0;
  const shouldShowActions = Boolean(actionsContent?.trim());

  if (!shouldShowTurnPatches && !shouldShowActions) {
    return null;
  }

  return (
    <article className="min-w-0 justify-self-stretch py-1">
      {shouldShowTurnPatches && (
        <div className="mt-1">
          <ToolPatchSection patches={turnPatches ?? []} />
        </div>
      )}
      {shouldShowActions && (
        <AgentMessageActions content={actionsContent ?? ""} />
      )}
    </article>
  );
}

function AgentMessageActions({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);
  const copyContent = useCallback(async () => {
    if (typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(content.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }, [content]);

  return (
    <div className="mt-2 flex items-center gap-1 text-ink-tertiary">
      <span className="inline-flex items-center gap-1.5 pr-1 text-xs text-success">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Done
      </span>
      <Button
        icon={
          copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />
        }
        onClick={copyContent}
        size="icon"
        tooltip={copied ? "Copied response" : "Copy response"}
        type="button"
        variant="ghost"
      />
      <Button
        className={feedback === "up" ? "bg-success/10 text-success" : ""}
        icon={<ThumbsUp className="h-4 w-4" />}
        onClick={() => setFeedback("up")}
        size="icon"
        tooltip="Good response"
        type="button"
        variant="ghost"
      />
      <Button
        className={feedback === "down" ? "bg-warning/10 text-warning" : ""}
        icon={<ThumbsDown className="h-4 w-4" />}
        onClick={() => setFeedback("down")}
        size="icon"
        tooltip="Bad response"
        type="button"
        variant="ghost"
      />
    </div>
  );
}

function InvocationCard({
  agentOwnerInfos = {},
  event,
}: {
  agentOwnerInfos?: Record<string, AgentOwnerInfo>;
  event: Extract<SessionEvent, { type: "invocation" }>;
}) {
  const sender = invocationParticipant(
    event.sender,
    agentOwnerInfoForEndpoint(event.sender, agentOwnerInfos),
    "Source agent",
  );
  const receiver = invocationParticipant(
    event.receiver,
    agentOwnerInfoForEndpoint(event.receiver, agentOwnerInfos),
    "Target agent",
  );
  const isReceived = event.side === "target";
  const isSent = event.side === "source";
  const isPending = event.state === "pending";
  const primary = isReceived ? sender : receiver;
  const label = isPending
    ? isReceived
      ? "Receiving from"
      : isSent
        ? "Sending to"
        : "Pending"
    : isReceived
      ? "Received from"
      : isSent
        ? "Sent to"
        : "Invoked";
  const content = invocationBodyContent(event, agentOwnerInfos);
  const DirectionIcon = isReceived ? ArrowDown : ArrowUp;

  return (
    <article
      className={
        isReceived
          ? "min-w-0 border-l-2 border-primary-hover py-2 pl-4"
          : "min-w-0 border-l-2 border-hairline-strong py-2 pl-4"
      }
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={
            isReceived
              ? "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary-hover/50 bg-primary-hover/10 text-primary-hover"
              : "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-hairline-strong bg-surface-1 text-ink-tertiary"
          }
        >
          <DirectionIcon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-tertiary">{label}</div>
          <InvocationParticipantView participant={primary} />
        </div>
      </div>
      {content && (
        <MarkdownMessage
          className="mt-2 pl-9 text-sm leading-5 text-ink-muted"
          content={content}
          muted
        />
      )}
    </article>
  );
}

function InvocationParticipantView({
  align = "left",
  participant,
}: {
  align?: "left" | "right";
  participant: { agentName: string; userName?: string };
}) {
  return (
    <div
      className={
        align === "right"
          ? "min-w-0 justify-self-end text-right"
          : "min-w-0 justify-self-start"
      }
    >
      <TruncatedText className="text-sm font-medium text-ink">
        {participant.agentName}
      </TruncatedText>
      {participant.userName && (
        <TruncatedText className="mt-0.5 text-xs text-ink-tertiary">
          {participant.userName}
        </TruncatedText>
      )}
    </div>
  );
}

function invocationParticipant(
  endpoint: Extract<SessionEvent, { type: "invocation" }>["sender"],
  ownerInfo: AgentOwnerInfo | undefined,
  fallback: string,
) {
  const resolved = Boolean(
    ownerInfo?.profile?.display_name ??
    ownerInfo?.agent.name ??
    endpoint?.agentName ??
    endpoint?.userName,
  );
  return {
    agentName:
      ownerInfo?.profile?.display_name ??
      ownerInfo?.agent.name ??
      endpoint?.agentName ??
      (endpoint?.agentId || endpoint?.representativeAgentId
        ? "Resolving agent..."
        : fallback),
    resolved,
    userName: ownerDisplayName(ownerInfo) ?? endpoint?.userName,
  };
}

function agentOwnerInfoForEndpoint(
  endpoint: Extract<SessionEvent, { type: "invocation" }>["sender"],
  ownerInfos: Record<string, AgentOwnerInfo>,
) {
  if (endpoint?.representativeAgentId) {
    return ownerInfos[`rep:${endpoint.representativeAgentId}`];
  }

  return endpoint?.agentId
    ? ownerInfos[`agent:${endpoint.agentId}`]
    : undefined;
}

function ownerDisplayName(ownerInfo: AgentOwnerInfo | undefined) {
  if (!ownerInfo) {
    return undefined;
  }

  if (ownerInfo.owner.user) {
    return (
      ownerInfo.owner.user.display_name ??
      ownerInfo.owner.user.name ??
      ownerInfo.owner.user.email
    );
  }

  return ownerInfo.owner.team?.name;
}

function WorkGroupCard({
  complete,
  events,
  onSelectToolEvidence,
  permissionDecision,
}: {
  complete: boolean;
  events: WorkActivityEvent[];
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  permissionDecision: PermissionDecisionState;
}) {
  const [expanded, setExpanded] = useState(false);
  const pendingPermissionCount = events.reduce(
    (count, event) =>
      event.type === "tool_call"
        ? count +
          (event.permissions?.filter(
            (permission) =>
              !permissionDecisionForPermission(permission, permissionDecision),
          ).length ?? 0)
        : count,
    0,
  );
  const isWorking =
    !complete &&
    (events.some(
      (event) =>
        (event.type === "progress" && event.streaming) ||
        (event.type === "tool_call" &&
          ["called", "queued", "running"].includes(event.status)),
    ) ||
      pendingPermissionCount > 0);
  const segments = workGroupSegments(events);

  return (
    <details
      className="group/work min-w-0 py-0"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 text-sm text-ink-muted outline-none transition hover:text-ink [&::-webkit-details-marker]:hidden">
        {isWorking ? (
          <LoaderCircle className="h-4 w-4 animate-spin text-primary-hover" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-ink-tertiary" />
        )}
        <span className="shrink-0">{isWorking ? "工作中" : "工作过程"}</span>
        {pendingPermissionCount > 0 && (
          <Badge className="shrink-0" tone="warning">
            {pendingPermissionCount} approval
            {pendingPermissionCount === 1 ? "" : "s"}
          </Badge>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 -rotate-90 text-ink-tertiary transition group-open/work:rotate-0" />
      </summary>
      {expanded && (
        <div className="mt-2 grid gap-2 border-l border-hairline pl-4">
          {segments.map((segment) =>
            segment.type === "thought" ? (
              <ThoughtCard event={segment.event} key={segment.event.id} />
            ) : (
              <ToolGroupCard
                events={segment.events}
                key={segment.id}
                onSelectToolEvidence={onSelectToolEvidence}
                permissionDecision={permissionDecision}
              />
            ),
          )}
        </div>
      )}
    </details>
  );
}

type WorkGroupSegment =
  | {
      type: "thought";
      event: Extract<SessionEvent, { type: "progress" }>;
    }
  | {
      type: "tools";
      id: string;
      events: ToolCallEvent[];
    };

function workGroupSegments(events: WorkActivityEvent[]): WorkGroupSegment[] {
  const segments: WorkGroupSegment[] = [];
  let toolSegment: Extract<WorkGroupSegment, { type: "tools" }> | undefined;

  for (const event of events) {
    if (event.type === "progress") {
      toolSegment = undefined;
      segments.push({ type: "thought", event });
      continue;
    }

    if (!toolSegment) {
      toolSegment = {
        type: "tools",
        id: `tools:${event.id}`,
        events: [],
      };
      segments.push(toolSegment);
    }
    toolSegment.events.push(event);
  }

  return segments;
}

function ToolGroupCard({
  events,
  onSelectToolEvidence,
  permissionDecision,
}: {
  events: ToolCallEvent[];
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  permissionDecision: PermissionDecisionState;
}) {
  const [expanded, setExpanded] = useState(false);
  const runningCount = events.filter(
    (event) => event.status === "running",
  ).length;
  const runningPreview = runningToolGroupPreview(events);
  const pendingPermissionCount = events.reduce(
    (count, event) =>
      count +
      (event.permissions?.filter(
        (permission) =>
          !permissionDecisionForPermission(permission, permissionDecision),
      ).length ?? 0),
    0,
  );

  return (
    <details
      className="group min-w-0 py-0"
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-2 text-sm text-ink-muted outline-none transition hover:text-ink [&::-webkit-details-marker]:hidden">
        {runningCount > 0 ? (
          <LoaderCircle className="h-4 w-4 animate-spin text-primary-hover" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-ink-tertiary" />
        )}
        <span className="shrink-0">工具调用</span>
        <Badge className="font-mono">{String(events.length)}</Badge>
        {runningPreview && (
          <TruncatedText
            className="min-w-0 flex-1 text-xs text-ink-subtle group-open:hidden"
            tooltip={runningPreview}
          >
            {runningPreview}
          </TruncatedText>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {pendingPermissionCount > 0 && (
            <Badge tone="warning">
              {pendingPermissionCount} approval
              {pendingPermissionCount === 1 ? "" : "s"}
            </Badge>
          )}
          {runningCount > 0 && (
            <Badge className="font-mono" tooltip={`${runningCount} running`}>
              {runningCount} running
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-ink-tertiary transition group-open:rotate-0" />
        </span>
      </summary>
      {expanded && (
        <div className="mt-2 overflow-hidden rounded-lg border border-hairline bg-surface-1">
          {events.map((event) => (
            <ToolEventRow
              event={event}
              key={event.id}
              onSelectToolEvidence={onSelectToolEvidence}
              permissionDecision={permissionDecision}
            />
          ))}
        </div>
      )}
    </details>
  );
}

function ToolEventRow({
  event,
  onSelectToolEvidence,
  permissionDecision,
}: {
  event: ToolCallEvent;
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  permissionDecision: PermissionDecisionState;
}) {
  const approvedDecisions = event.permissions
    ?.map((permission) =>
      permissionDecisionForPermission(permission, permissionDecision),
    )
    .filter((decision) => decision?.status === "approved");
  const approvalBadgeLabel = approvalSummaryBadgeLabel(approvedDecisions);
  const hasApprovedPermission = Boolean(approvalBadgeLabel);
  const approvedPermissionLabel = approvalBadgeLabel ?? "approved";
  const hasPendingPermission = event.permissions?.some((permission) => {
    const decision = permissionDecisionForPermission(
      permission,
      permissionDecision,
    );
    return !decision;
  });
  const appliedPatches = toolCallAppliedPatches(event);
  const proposedPatches = toolCallProposedPatches(event);
  const codePatches =
    appliedPatches.length > 0 ? appliedPatches : proposedPatches;

  if (codePatches.length > 0) {
    return (
      <PatchToolEventRow
        codePatches={codePatches}
        event={event}
        intent={appliedPatches.length > 0 ? "edited" : "proposed"}
        onSelectToolEvidence={onSelectToolEvidence}
        permissionDecision={permissionDecision}
      />
    );
  }

  return (
    <details
      className="group/tool min-w-0 border-b border-hairline last:border-b-0"
      open={hasPendingPermission}
    >
      <summary
        className="grid min-h-9 cursor-pointer list-none grid-cols-[16px_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-1.5 outline-none transition hover:bg-canvas/70 [&::-webkit-details-marker]:hidden"
        onClick={() => onSelectToolEvidence?.({ type: "tool", event })}
      >
        <ToolStatusMark status={event.status} />
        <TruncatedText
          className="font-mono text-xs text-ink-muted"
          tooltip={event.name}
        >
          {event.name}
        </TruncatedText>
        <div className="flex shrink-0 items-center gap-1.5">
          <ToolStatusBadge status={event.status} />
          {hasApprovedPermission && (
            <Badge tone="success">{approvedPermissionLabel}</Badge>
          )}
        </div>
        <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-ink-tertiary transition group-open/tool:rotate-0" />
      </summary>
      <div className="grid gap-3 border-t border-hairline bg-canvas/60 p-3">
        <ToolPermissionsSection
          event={event}
          onSelectToolEvidence={onSelectToolEvidence}
          permissionDecision={permissionDecision}
        />
        <ToolPayloadSection label="Input" value={event.input} />
        <ToolPayloadSection
          fallback={event.status === "done" ? "Success" : undefined}
          label="Output"
          value={event.output}
        />
      </div>
    </details>
  );
}

function PatchToolEventRow({
  codePatches,
  event,
  intent,
  onSelectToolEvidence,
  permissionDecision,
}: {
  codePatches: CodePatch[];
  event: ToolCallEvent;
  intent: "edited" | "proposed";
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  permissionDecision: PermissionDecisionState;
}) {
  const allApproved =
    intent === "proposed" &&
    event.permissions?.length &&
    event.permissions.every(
      (permission) =>
        permissionDecisionForPermission(permission, permissionDecision)
          ?.status === "approved",
    );
  const summaryIntent =
    intent === "edited" || !allApproved ? intent : "approved";

  return (
    <article
      className="min-w-0 cursor-pointer border-b border-hairline bg-canvas/40 p-3 outline-none transition hover:bg-canvas/70 focus-visible:ring-2 focus-visible:ring-primary-focus/40 last:border-b-0"
      onClick={() => onSelectToolEvidence?.({ type: "tool", event })}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onSelectToolEvidence?.({ type: "tool", event });
        }
      }}
      role={onSelectToolEvidence ? "button" : undefined}
      tabIndex={onSelectToolEvidence ? 0 : undefined}
    >
      {(intent === "edited" || !event.permissions?.length) && (
        <CompactPatchToolSummary intent={summaryIntent} patches={codePatches} />
      )}
      {event.permissions && event.permissions.length > 0 && (
        <div className={intent === "edited" ? "mt-3" : ""}>
          <ToolPermissionsSection
            event={event}
            onSelectToolEvidence={onSelectToolEvidence}
            permissionDecision={permissionDecision}
          />
        </div>
      )}
    </article>
  );
}

function CompactPatchToolSummary({
  intent = "edited",
  patches,
}: {
  intent?: "approved" | "edited" | "proposed";
  patches: CodePatch[];
}) {
  const titles = patches.map((patch) => patch.path ?? patch.operation);
  const primaryTitle = titles[0] ?? "file";
  const extraCount = Math.max(0, titles.length - 1);
  const tooltip = titles.join("\n");
  const label =
    intent === "edited"
      ? compactPatchLabel(patches)
      : intent === "approved"
        ? "Approved edit"
        : "Proposed edit";

  return (
    <div className="grid min-h-9 min-w-0 grid-cols-[16px_minmax(0,1fr)] items-center gap-2">
      <FileCode className="h-4 w-4 text-ink-tertiary" />
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-sm text-ink-muted">{label}</span>
        <TruncatedText className="font-mono text-xs text-ink" tooltip={tooltip}>
          {primaryTitle}
          {extraCount > 0 ? ` +${extraCount}` : ""}
        </TruncatedText>
      </div>
    </div>
  );
}

function ToolEvidencePatchList({ patches }: { patches: CodePatch[] }) {
  if (patches.length === 0) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="border-b border-hairline px-3 py-2 text-xs uppercase tracking-wide text-ink-tertiary">
        Files
      </div>
      <div className="grid divide-y divide-hairline">
        {patches.map((patch) => {
          const stats = codePatchStats(patch);
          const title = patch.path ?? patch.operation;
          return (
            <div
              className="grid min-w-0 gap-1 px-3 py-2"
              key={codePatchKey(patch)}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <TruncatedText
                  className="font-mono text-xs text-ink"
                  tooltip={title}
                >
                  {title}
                </TruncatedText>
                <PatchStatsView
                  className="shrink-0 font-mono text-xs"
                  summary={patchStatsSummary([patch], stats)}
                />
              </div>
              <div className="text-xs text-ink-tertiary">
                {patch.operation}
                {patch.source ? ` · ${patch.source}` : ""}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function compactPatchLabel(patches: CodePatch[]) {
  const noun = patches.length === 1 ? "file" : "files";
  if (patches.every((patch) => patch.operation === "delete")) {
    return `Deleted ${noun}`;
  }
  if (patches.some((patch) => patch.operation === "delete")) {
    return `Changed ${noun}`;
  }
  return `Edited ${noun}`;
}

function ToolPermissionsSection({
  event,
  onSelectToolEvidence,
  permissionDecision,
}: {
  event: ToolCallEvent;
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  permissionDecision: PermissionDecisionState;
}) {
  if (!event.permissions || event.permissions.length === 0) {
    return null;
  }

  return (
    <section className="grid gap-2">
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">
        Approval request
      </div>
      {event.permissions.map((permission) => (
        <PermissionRequestCard
          compactApproved={false}
          event={permission}
          key={permission.id}
          onSelectToolEvidence={onSelectToolEvidence}
          permissionDecision={permissionDecision}
        />
      ))}
    </section>
  );
}

function ToolPatchSection({ patches }: { patches: CodePatch[] }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedPatchKey, setSelectedPatchKey] = useState<string | null>(null);

  if (patches.length === 0) {
    return null;
  }

  const patchGroups = groupPatchesByFile(patches);
  const shortPathLabels = shortPatchPathLabels(
    patchGroups.flatMap((group) => group.patches),
  );
  const patchSummaries = patchGroups.map((group) => ({
    key: group.key,
    patches: group.patches,
    primaryPatch: group.patches.at(-1) ?? group.patches[0],
    title: group.path
      ? (shortPathLabels.get(group.path) ?? group.path)
      : group.key,
    stats: codePatchGroupStats(group.patches),
  }));
  const selectedPatch =
    patchSummaries.find((summary) => summary.key === selectedPatchKey)
      ?.primaryPatch ?? null;
  const totalStats = patchSummaries.reduce(
    (total, summary) => ({
      added: total.added + summary.stats.added,
      removed: total.removed + summary.stats.removed,
    }),
    { added: 0, removed: 0 },
  );
  const allPatches = patchSummaries.flatMap((summary) => summary.patches);
  const statsSummary = patchStatsSummary(allPatches, totalStats);
  const visibleSummaries = expanded
    ? patchSummaries
    : patchSummaries.slice(0, 3);
  const hiddenCount = Math.max(0, patchSummaries.length - 3);
  const titleLabel = patchSectionTitle(allPatches, patchSummaries.length);

  return (
    <section className="overflow-hidden rounded-lg border border-hairline bg-surface-1">
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-ink-muted">
            <FileCode className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink">{titleLabel}</div>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-xs">
              <PatchStatsView summary={statsSummary} />
            </div>
          </div>
        </div>
        <Button
          onClick={() => setSelectedPatchKey(patchSummaries[0]?.key ?? null)}
          size="sm"
          type="button"
          variant="secondary"
        >
          Review
        </Button>
      </div>
      <div className="grid divide-y divide-hairline">
        {visibleSummaries.map(({ key, patches, stats, title }) => {
          const tooltip = patches[0]?.path ?? title;
          return (
            <button
              className="grid min-h-9 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-left transition hover:bg-canvas/80"
              key={key}
              onClick={() => setSelectedPatchKey(key)}
              type="button"
            >
              <TruncatedText
                className="font-mono text-xs text-ink-muted"
                tooltip={tooltip}
              >
                {title}
              </TruncatedText>
              <PatchStatsView
                className="shrink-0 font-mono text-xs"
                summary={patchStatsSummary(patches, stats)}
              />
            </button>
          );
        })}
        {hiddenCount > 0 && (
          <button
            className="flex min-h-9 items-center gap-1 px-3 py-2 text-left text-sm text-ink-muted transition hover:bg-canvas/80 hover:text-ink"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
            <span>
              {expanded ? "Collapse" : `Show ${hiddenCount} more files`}
            </span>
            <ChevronDown
              className={expanded ? "h-3.5 w-3.5 rotate-180" : "h-3.5 w-3.5"}
            />
          </button>
        )}
      </div>
      {selectedPatch && (
        <PatchSidePanel
          onClose={() => setSelectedPatchKey(null)}
          patch={selectedPatch}
        />
      )}
    </section>
  );
}

function PatchSidePanel({
  onClose,
  patch,
}: {
  onClose: () => void;
  patch: CodePatch;
}) {
  const title = patch.path ?? patch.operation;
  const stats = codePatchStats(patch);
  const lines = diffLinesForPatch(patch);
  const showOldLineNumbers = lines.some((line) => line.oldLine !== undefined);
  const showNewLineNumbers = lines.some((line) => line.newLine !== undefined);

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <aside
        className="absolute inset-y-0 right-0 flex w-[min(calc(100vw-3rem),760px)] flex-col border-l border-hairline bg-surface-1 shadow-2xl shadow-black/40 max-sm:w-full"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-hairline px-4">
          <div className="min-w-0">
            <TruncatedText
              className="font-mono text-sm font-medium text-ink"
              tooltip={title}
            >
              {title}
            </TruncatedText>
            <div className="mt-1 flex items-center gap-3 text-xs">
              <PatchStatsView
                className="font-mono"
                summary={patchStatsSummary([patch], stats)}
              />
              <span className="text-ink-tertiary">{patch.operation}</span>
              {patch.source && (
                <span className="text-ink-tertiary">{patch.source}</span>
              )}
            </div>
          </div>
          <Button
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
            size="icon"
            tooltip="Close diff"
            type="button"
            variant="ghost"
          />
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-canvas">
          <div className="min-w-max py-3 font-mono text-xs leading-5">
            {lines.map((line, index) => (
              <DiffLineView
                key={`${index}:${line.oldLine ?? ""}:${line.newLine ?? ""}`}
                line={line}
                showNewLineNumbers={showNewLineNumbers}
                showOldLineNumbers={showOldLineNumbers}
              />
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DiffLineView({
  line,
  showNewLineNumbers,
  showOldLineNumbers,
}: {
  line: DiffLine;
  showNewLineNumbers: boolean;
  showOldLineNumbers: boolean;
}) {
  const rowClass =
    line.kind === "add"
      ? "bg-emerald-500/15 text-ink"
      : line.kind === "remove"
        ? "bg-red-500/20 text-ink"
        : line.kind === "hunk"
          ? "bg-primary/10 text-primary-hover"
          : line.kind === "meta"
            ? "text-ink-tertiary"
            : "text-ink-muted";
  const markerClass =
    line.kind === "add"
      ? "text-emerald-400"
      : line.kind === "remove"
        ? "text-red-400"
        : "text-ink-tertiary";
  const gridTemplateColumns = [
    showOldLineNumbers ? "2.75rem" : null,
    showNewLineNumbers ? "2.75rem" : null,
    "1.25rem",
    "minmax(32rem,1fr)",
  ]
    .filter(Boolean)
    .join(" ");
  const numberColumnClass = "select-none px-1 text-right text-ink-tertiary";

  return (
    <div className={`grid ${rowClass}`} style={{ gridTemplateColumns }}>
      {showOldLineNumbers && (
        <span
          className={`${numberColumnClass} ${
            !showNewLineNumbers ? "border-r border-hairline" : ""
          }`}
        >
          {line.oldLine ?? ""}
        </span>
      )}
      {showNewLineNumbers && (
        <span className={`${numberColumnClass} border-r border-hairline`}>
          {line.newLine ?? ""}
        </span>
      )}
      <span className={`select-none px-1 ${markerClass}`}>{line.marker}</span>
      <span className="whitespace-pre pr-4">{line.content || " "}</span>
    </div>
  );
}

function codePatchKey(patch: CodePatch) {
  return [
    patch.operation,
    patch.path ?? "",
    patch.oldText ?? "",
    patch.newText ?? "",
    patch.diffText ?? "",
  ].join("\u0000");
}

function groupPatchesByFile(patches: CodePatch[]) {
  const groups = new Map<
    string,
    { key: string; path?: string; patches: CodePatch[] }
  >();
  for (const patch of patches) {
    const key = patch.path ?? codePatchKey(patch);
    const existing = groups.get(key);
    if (existing) {
      existing.patches.push(patch);
      continue;
    }
    groups.set(key, {
      key,
      ...(patch.path !== undefined ? { path: patch.path } : {}),
      patches: [patch],
    });
  }
  return [...groups.values()];
}

function shortPatchPathLabels(patches: CodePatch[]) {
  const labels = new Map<string, string>();
  const paths = [...new Set(patches.flatMap((patch) => patch.path ?? []))];
  const pathsByFileName = new Map<string, string[]>();

  for (const path of paths) {
    const fileName = lastPathSegment(path);
    pathsByFileName.set(fileName, [
      ...(pathsByFileName.get(fileName) ?? []),
      path,
    ]);
  }

  for (const [fileName, conflictingPaths] of pathsByFileName) {
    if (conflictingPaths.length === 1) {
      labels.set(conflictingPaths[0], fileName);
      continue;
    }

    const maxDepth = Math.max(
      ...conflictingPaths.map((path) => pathSegments(path).length),
    );
    for (let depth = 1; depth <= maxDepth; depth += 1) {
      const candidates = conflictingPaths.map((path) =>
        pathSuffix(path, depth),
      );
      if (new Set(candidates).size !== conflictingPaths.length) {
        continue;
      }
      conflictingPaths.forEach((path, index) => {
        labels.set(path, candidates[index]);
      });
      break;
    }
  }

  return labels;
}

function lastPathSegment(path: string) {
  return pathSegments(path).at(-1) ?? path;
}

function pathSuffix(path: string, depth: number) {
  const segments = pathSegments(path);
  return segments.slice(Math.max(0, segments.length - depth)).join("/");
}

function pathSegments(path: string) {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments.length > 0 ? segments : [path];
}

type PatchStatsSummary =
  | { kind: "deleted" }
  | { added: number; kind: "lines_with_delete"; removed: number }
  | { added: number; kind: "lines"; removed: number };

function patchStatsSummary(
  patches: CodePatch[],
  stats: { added: number; removed: number },
): PatchStatsSummary {
  if (patches.every(isContentUnknownDeletePatch)) {
    return { kind: "deleted" };
  }
  if (patches.some(isContentUnknownDeletePatch)) {
    return {
      kind: "lines_with_delete",
      added: stats.added,
      removed: stats.removed,
    };
  }
  return { kind: "lines", added: stats.added, removed: stats.removed };
}

function PatchStatsView({
  className,
  summary,
}: {
  className?: string;
  summary: PatchStatsSummary;
}) {
  if (summary.kind === "deleted") {
    return <span className={cn("text-red-400", className)}>deleted</span>;
  }

  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="text-emerald-400">+{summary.added}</span>
      <span className="text-red-400">-{summary.removed}</span>
      {summary.kind === "lines_with_delete" && (
        <span className="text-red-400">deleted</span>
      )}
    </span>
  );
}

function isContentUnknownDeletePatch(patch: CodePatch) {
  return (
    patch.operation === "delete" &&
    patch.diffText === undefined &&
    patch.oldText === undefined
  );
}

function patchSectionTitle(patches: CodePatch[], fileCount: number) {
  const count = fileCount;
  const noun = count === 1 ? "file" : "files";
  if (patches.every((patch) => patch.operation === "delete")) {
    return `Deleted ${count} ${noun}`;
  }
  if (patches.some((patch) => patch.operation === "delete")) {
    return `Changed ${count} ${noun}`;
  }
  return `Edited ${count} ${noun}`;
}

type DiffLine = {
  content: string;
  kind: "add" | "remove" | "context" | "hunk" | "meta";
  marker: string;
  newLine?: number;
  oldLine?: number;
};

function codePatchStats(patch: CodePatch) {
  if (!patch.diffText) {
    return {
      added: patch.newText === undefined ? 0 : changedLineCount(patch.newText),
      removed:
        patch.oldText === undefined ? 0 : changedLineCount(patch.oldText),
    };
  }

  return diffStats(codePatchToText(patch));
}

function codePatchGroupStats(patches: CodePatch[]) {
  return patches.reduce(
    (total, patch) => {
      const stats = codePatchStats(patch);
      return {
        added: total.added + stats.added,
        removed: total.removed + stats.removed,
      };
    },
    { added: 0, removed: 0 },
  );
}

function changedLineCount(value: string) {
  if (value.length === 0) {
    return 0;
  }
  return value.replace(/\n$/, "").split("\n").length;
}

function diffStats(diffText: string) {
  return diffText.split("\n").reduce(
    (stats, line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        stats.added += 1;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        stats.removed += 1;
      }
      return stats;
    },
    { added: 0, removed: 0 },
  );
}

function diffLinesForPatch(patch: CodePatch) {
  const lines = codePatchToText(patch).split("\n");
  const parsed: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const rawLine of lines) {
    const hunk = /^@@ -?(\d+)?(?:,\d+)? \+?(\d+)?(?:,\d+)? @@/.exec(rawLine);
    if (hunk) {
      oldLine = hunk[1] ? Number(hunk[1]) : oldLine;
      newLine = hunk[2] ? Number(hunk[2]) : newLine;
      parsed.push({
        content: rawLine,
        kind: "hunk",
        marker: "",
      });
      continue;
    }

    if (rawLine === "@@") {
      parsed.push({ content: rawLine, kind: "hunk", marker: "" });
      oldLine = 1;
      newLine = 1;
      continue;
    }

    if (rawLine.startsWith("diff --git ") || rawLine.startsWith("index ")) {
      parsed.push({ content: rawLine, kind: "meta", marker: "" });
      continue;
    }

    if (rawLine.startsWith("---") || rawLine.startsWith("+++")) {
      parsed.push({ content: rawLine, kind: "meta", marker: "" });
      continue;
    }

    if (rawLine.startsWith("+")) {
      parsed.push({
        content: rawLine.slice(1),
        kind: "add",
        marker: "+",
        newLine,
      });
      newLine += 1;
      continue;
    }

    if (rawLine.startsWith("-")) {
      parsed.push({
        content: rawLine.slice(1),
        kind: "remove",
        marker: "-",
        oldLine,
      });
      oldLine += 1;
      continue;
    }

    const content = rawLine.startsWith(" ") ? rawLine.slice(1) : rawLine;
    parsed.push({
      content,
      kind: "context",
      marker: rawLine.startsWith(" ") ? " " : "",
      newLine,
      oldLine,
    });
    oldLine += 1;
    newLine += 1;
  }

  return parsed;
}

function permissionDecisionForPermission(
  permission: Extract<SessionEvent, { type: "permission_request" }>,
  permissionDecision: PermissionDecisionState,
) {
  return (
    permission.decision ??
    (permission.approvalId
      ? permissionDecision.decisions[permission.approvalId]
      : undefined)
  );
}

function approvalSummaryBadgeLabel(
  decisions: (PermissionDecision | undefined)[] | undefined,
) {
  const approved = (decisions ?? []).filter(
    (decision): decision is PermissionDecision =>
      decision?.status === "approved",
  );
  if (approved.length === 0) {
    return undefined;
  }

  const sources = new Set(approved.map((decision) => decision.source));
  if (sources.size === 1 && sources.has("auto")) {
    return "auto approved";
  }
  if (sources.size === 1 && sources.has("user")) {
    return "approved by user";
  }
  return "approved";
}

function permissionDecisionLabel(decision: PermissionDecision | undefined) {
  if (decision?.source === "auto") {
    return "auto approved";
  }
  if (decision?.source === "user") {
    return "approved by user";
  }
  return "approved";
}

function permissionDecisionStatusText(
  decision: PermissionDecision | undefined,
) {
  if (decision?.status === "denied") {
    return "Permission denied";
  }
  if (decision?.source === "auto") {
    return "Permission approved automatically";
  }
  if (decision?.source === "user") {
    return "Permission approved by user";
  }
  return "Permission approved";
}

function ToolPayloadSection({
  fallback,
  label,
  value,
}: {
  fallback?: string;
  label: string;
  value: unknown;
}) {
  if (value === undefined && !fallback) {
    return null;
  }

  const text = textFromPayload(value) ?? fallback;
  return (
    <section className="grid gap-2">
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      {text ? (
        <MarkdownMessage
          className="rounded-md border border-hairline bg-surface-1 px-3 py-2 text-xs leading-6 text-ink-muted"
          content={text}
          muted
        />
      ) : (
        <pre className="max-h-56 overflow-auto rounded-md border border-hairline bg-surface-1 p-3 text-xs leading-5 text-ink-muted">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </section>
  );
}

function ToolStatusBadge({ status }: { status: ToolCallEvent["status"] }) {
  if (status === "done") {
    return <Badge tone="success">done</Badge>;
  }

  if (status === "error") {
    return <Badge tone="warning">error</Badge>;
  }

  if (status === "queued") {
    return <Badge>queued</Badge>;
  }

  if (status === "called") {
    return <Badge>called</Badge>;
  }

  return <Badge>running</Badge>;
}

function ToolStatusMark({ status }: { status: ToolCallEvent["status"] }) {
  if (status === "running") {
    return (
      <span
        aria-label="running"
        className="h-3.5 w-3.5 animate-spin rounded-full border border-primary-hover border-t-transparent"
      />
    );
  }

  if (status === "error") {
    return <span className="h-2 w-2 rounded-full bg-warning" />;
  }

  if (status === "queued" || status === "called") {
    return <span className="h-2 w-2 rounded-full bg-ink-tertiary" />;
  }

  return <span className="h-2 w-2 rounded-full bg-success" />;
}

function PermissionRequestCard({
  compactApproved = true,
  event,
  onSelectToolEvidence,
  permissionDecision,
}: {
  compactApproved?: boolean;
  event: Extract<SessionEvent, { type: "permission_request" }>;
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  permissionDecision: PermissionDecisionState;
}) {
  const pending =
    permissionDecision.pending &&
    permissionDecision.pendingApprovalId === event.approvalId;
  const decided = permissionDecisionForPermission(event, permissionDecision);
  const approved = decided?.status === "approved";
  const denied = decided?.status === "denied";
  const approvedLabel = permissionDecisionLabel(decided);
  const canDecide =
    Boolean(event.approvalId) && !permissionDecision.pending && !decided;
  const patchPatches = permissionRequestPatches(event);

  if (patchPatches.length > 0) {
    return (
      <PatchPermissionRequestCard
        approved={approved}
        approvedLabel={approvedLabel}
        canDecide={canDecide}
        decided={decided}
        denied={denied}
        event={event}
        onSelectToolEvidence={onSelectToolEvidence}
        patches={patchPatches}
        pending={pending}
        permissionDecision={permissionDecision}
      />
    );
  }

  if (approved && compactApproved) {
    return (
      <article
        className="flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-lg border border-success/70 bg-success/5 px-3 py-2.5 outline-none transition hover:bg-success/10 focus-visible:ring-2 focus-visible:ring-primary-focus/40"
        onClick={() => onSelectToolEvidence?.({ type: "permission", event })}
        onKeyDown={(keyboardEvent) => {
          if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
            keyboardEvent.preventDefault();
            onSelectToolEvidence?.({ type: "permission", event });
          }
        }}
        role={onSelectToolEvidence ? "button" : undefined}
        tabIndex={onSelectToolEvidence ? 0 : undefined}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
          <TruncatedText
            className="text-sm font-medium text-ink"
            tooltip={event.title}
          >
            {event.title}
          </TruncatedText>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-success">
          <span>{approvedLabel}</span>
          <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "min-w-0 cursor-pointer rounded-lg border p-3 outline-none transition focus-visible:ring-2 focus-visible:ring-primary-focus/40",
        approved
          ? "border-success/60 bg-success/5 hover:bg-success/10"
          : denied
            ? "border-warning/50 bg-warning/5 hover:bg-warning/10"
            : "border-warning/40 bg-surface-1 hover:bg-surface-2",
      )}
      onClick={() => onSelectToolEvidence?.({ type: "permission", event })}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onSelectToolEvidence?.({ type: "permission", event });
        }
      }}
      role={onSelectToolEvidence ? "button" : undefined}
      tabIndex={onSelectToolEvidence ? 0 : undefined}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ShieldCheck
            className={
              approved
                ? "h-4 w-4 shrink-0 text-success"
                : "h-4 w-4 shrink-0 text-warning"
            }
          />
          <TruncatedText
            className="text-sm font-medium text-ink"
            tooltip={event.title}
          >
            {event.title}
          </TruncatedText>
        </div>
        {approved ? (
          <Badge tone="success">{approvedLabel}</Badge>
        ) : denied ? (
          <Badge tone="warning">denied</Badge>
        ) : (
          <Badge tone="warning">permission</Badge>
        )}
      </div>
      {decided && (
        <div className="mt-3 rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink-muted">
          {permissionDecisionStatusText(decided)} ·{" "}
          <span className="font-mono text-xs">{decided.decisionOption}</span>
        </div>
      )}
      {event.toolKind && event.toolKind !== "execute" && (
        <div className="mt-3 grid min-w-0 gap-1">
          <MonoId>kind: {event.toolKind}</MonoId>
        </div>
      )}
      {event.description && (
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          {event.description}
        </p>
      )}
      {event.rawInput !== undefined && (
        <div className="mt-3">
          <div className="mb-1 text-xs uppercase tracking-wide text-ink-tertiary">
            Request asked for
          </div>
          {(() => {
            const requestText = textFromPayload(event.rawInput);
            return requestText ? (
              <MarkdownMessage
                className="rounded-md border border-hairline bg-canvas p-2 text-xs leading-5 text-ink-muted"
                content={requestText}
                muted
              />
            ) : (
              <pre className="max-h-40 max-w-full overflow-auto rounded-md border border-hairline bg-canvas p-2 text-xs leading-5 text-ink-muted">
                {JSON.stringify(event.rawInput, null, 2)}
              </pre>
            );
          })()}
        </div>
      )}
      <div
        className="mt-4 flex flex-wrap gap-2"
        onClick={(clickEvent) => clickEvent.stopPropagation()}
      >
        {permissionDecisionOptions.map((option) => (
          <Button
            disabled={!canDecide}
            icon={
              pending ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : undefined
            }
            key={option.optionId}
            onClick={() => {
              if (event.approvalId) {
                permissionDecision.onDecision(
                  event.approvalId,
                  option.optionId,
                );
              }
            }}
            size="sm"
            tooltip={
              event.approvalId
                ? `decision_option=${option.optionId}`
                : "Waiting for manager approval id"
            }
            type="button"
            variant={option.variant}
          >
            {option.label}
          </Button>
        ))}
      </div>
      {permissionDecision.error &&
        permissionDecision.pendingApprovalId === event.approvalId && (
          <InlineError error={permissionDecision.error} />
        )}
    </article>
  );
}

function PatchPermissionRequestCard({
  approved,
  approvedLabel,
  canDecide,
  decided,
  denied,
  event,
  onSelectToolEvidence,
  patches,
  pending,
  permissionDecision,
}: {
  approved: boolean;
  approvedLabel: string;
  canDecide: boolean;
  decided: PermissionDecision | undefined;
  denied: boolean;
  event: Extract<SessionEvent, { type: "permission_request" }>;
  onSelectToolEvidence?: (selection: ToolEvidenceSelection) => void;
  patches: CodePatch[];
  pending: boolean;
  permissionDecision: PermissionDecisionState;
}) {
  const titles = patches.map((patch) => patch.path ?? patch.operation);
  const title = titles[0] ?? event.title;
  const extraCount = Math.max(0, patches.length - 1);
  const label = denied
    ? "Denied edit"
    : approved
      ? "Approved edit"
      : "Proposed edit";

  return (
    <article
      className={cn(
        "min-w-0 cursor-pointer rounded-lg border p-3 outline-none transition focus-visible:ring-2 focus-visible:ring-primary-focus/40",
        approved
          ? "border-success/50 bg-success/5 hover:bg-success/10"
          : denied
            ? "border-warning/50 bg-warning/5 hover:bg-warning/10"
            : "border-warning/40 bg-surface-1 hover:bg-surface-2",
      )}
      onClick={() => onSelectToolEvidence?.({ type: "permission", event })}
      onKeyDown={(keyboardEvent) => {
        if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
          keyboardEvent.preventDefault();
          onSelectToolEvidence?.({ type: "permission", event });
        }
      }}
      role={onSelectToolEvidence ? "button" : undefined}
      tabIndex={onSelectToolEvidence ? 0 : undefined}
    >
      <div className="grid min-w-0 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-2">
        <ShieldCheck
          className={
            approved
              ? "h-4 w-4 text-success"
              : denied
                ? "h-4 w-4 text-warning"
                : "h-4 w-4 text-ink-tertiary"
          }
        />
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-medium text-ink">{label}</span>
          <TruncatedText
            className="font-mono text-xs text-ink-muted"
            tooltip={titles.join("\n") || event.title}
          >
            {title}
            {extraCount > 0 ? ` +${extraCount}` : ""}
          </TruncatedText>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {approved ? (
            <Badge tone="success">{approvedLabel}</Badge>
          ) : denied ? (
            <Badge tone="warning">denied</Badge>
          ) : (
            <Badge tone="warning">permission</Badge>
          )}
        </div>
      </div>

      {decided && (
        <div className="mt-3 rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink-muted">
          {permissionDecisionStatusText(decided)} ·{" "}
          <span className="font-mono text-xs">{decided.decisionOption}</span>
        </div>
      )}

      {event.toolKind && (
        <div className="mt-3">
          <MonoId>kind: {event.toolKind}</MonoId>
        </div>
      )}

      {!decided && (
        <PermissionDecisionButtons
          canDecide={canDecide}
          event={event}
          onClickCapture={(clickEvent) => clickEvent.stopPropagation()}
          pending={pending}
          permissionDecision={permissionDecision}
        />
      )}

      {permissionDecision.error &&
        permissionDecision.pendingApprovalId === event.approvalId && (
          <InlineError error={permissionDecision.error} />
        )}
    </article>
  );
}

function PermissionDecisionButtons({
  canDecide,
  event,
  onClickCapture,
  pending,
  permissionDecision,
}: {
  canDecide: boolean;
  event: Extract<SessionEvent, { type: "permission_request" }>;
  onClickCapture?: (event: MouseEvent<HTMLDivElement>) => void;
  pending: boolean;
  permissionDecision: PermissionDecisionState;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2" onClick={onClickCapture}>
      {permissionDecisionOptions.map((option) => (
        <Button
          disabled={!canDecide}
          icon={
            pending ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : undefined
          }
          key={option.optionId}
          onClick={() => {
            if (event.approvalId) {
              permissionDecision.onDecision(event.approvalId, option.optionId);
            }
          }}
          size="sm"
          tooltip={
            event.approvalId
              ? `decision_option=${option.optionId}`
              : "Waiting for manager approval id"
          }
          type="button"
          variant={option.variant}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function permissionRequestPatches(
  event: Extract<SessionEvent, { type: "permission_request" }>,
) {
  return permissionRequestCodePatches(event);
}

function PaxThoughtIcon() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 bg-primary-hover"
      style={{
        WebkitMask: "url('/pax-icon.svg') center / contain no-repeat",
        mask: "url('/pax-icon.svg') center / contain no-repeat",
      }}
    />
  );
}

function InlineError({ error }: { error: Error }) {
  return (
    <TruncatedText className="text-xs text-warning">
      {error.name}: {error.message}
    </TruncatedText>
  );
}

function textFromPayload(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const text = value.map(textFromPayload).filter(Boolean).join("\n");
    return text || undefined;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const description = stringValue(record, "description");
  const command = stringValue(record, "command");
  if (description && command) {
    return `${description}\n\n\`${command}\``;
  }

  const directText =
    stringValue(record, "text") ??
    command ??
    description ??
    stringValue(record, "output");
  if (directText) {
    return directText;
  }

  for (const key of ["content", "result", "rawInput", "raw_input"]) {
    const text = textFromPayload(record[key]);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function runningToolGroupPreview(events: ToolCallEvent[]) {
  const runningEvents = events.filter((event) => event.status === "running");
  const current = runningEvents[0];
  if (!current) {
    return undefined;
  }

  const inputPreview = compactToolInputPreview(current.input);
  const additional = runningEvents.length - 1;
  return [
    inputPreview ? `${current.name} · ${inputPreview}` : current.name,
    additional > 0 ? `+${additional} more` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

function compactToolInputPreview(value: unknown) {
  const text = textFromPayload(value) ?? toolInputIdentifier(value);
  if (!text) {
    return undefined;
  }

  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

function toolInputIdentifier(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of [
    "path",
    "filePath",
    "file_path",
    "query",
    "pattern",
    "url",
  ]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return undefined;
}

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}
