import { useCallback, useState } from "react";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { AgentOwnerInfo } from "@/features/api/types";
import {
  PermissionDecision,
  SessionEvent,
  ToolCallEvent,
  WorkstreamItem,
} from "@/features/runtime/session-events";
import { invocationBodyContent } from "@/features/runtime/invocation-body-content";

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

export function WorkstreamItemCard({
  agentOwnerInfos,
  item,
  permissionDecision,
}: {
  agentOwnerInfos?: Record<string, AgentOwnerInfo>;
  item: WorkstreamItem;
  permissionDecision: PermissionDecisionState;
}) {
  if (item.type === "tool_group") {
    return (
      <ToolGroupCard
        events={item.events}
        permissionDecision={permissionDecision}
      />
    );
  }

  return (
    <EventCard
      agentOwnerInfos={agentOwnerInfos}
      event={item.event}
      permissionDecision={permissionDecision}
      showActions={item.showActions}
    />
  );
}

function EventCard({
  agentOwnerInfos,
  event,
  permissionDecision,
  showActions,
}: {
  agentOwnerInfos?: Record<string, AgentOwnerInfo>;
  event: Exclude<SessionEvent, ToolCallEvent>;
  permissionDecision: PermissionDecisionState;
  showActions?: boolean;
}) {
  if (event.type === "file_change") {
    return <FileChangeCard event={event} />;
  }

  if (event.type === "progress") {
    return <ThoughtCard event={event} />;
  }

  if (event.type === "permission_request") {
    return (
      <PermissionRequestCard
        event={event}
        permissionDecision={permissionDecision}
      />
    );
  }

  if (event.type === "user_message") {
    return <UserMessageCard event={event} />;
  }

  if (event.type === "agent_message") {
    return <AgentMessageCard event={event} showActions={showActions} />;
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

function ThoughtCard({
  event,
}: {
  event: Extract<SessionEvent, { type: "progress" }>;
}) {
  return (
    <details className="group min-w-0 py-1" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-ink-muted outline-none transition hover:text-ink [&::-webkit-details-marker]:hidden">
        <PaxThoughtIcon />
        <span>{event.streaming ? "思考中" : "已思考"}</span>
        <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-ink-tertiary transition group-open:rotate-0" />
      </summary>
      <MarkdownMessage
        className="mt-4 pl-1 text-[13px] leading-7"
        content={event.content}
        muted
        streaming={event.streaming}
      />
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
          className="overflow-hidden text-sm leading-7 text-ink"
          content={event.content}
        />
      </div>
    </article>
  );
}

function AgentMessageCard({
  event,
  showActions,
}: {
  event: Extract<SessionEvent, { type: "agent_message" }>;
  showActions?: boolean;
}) {
  const shouldShowActions =
    showActions === true && !event.streaming && event.content.trim().length > 0;

  return (
    <article className="min-w-0 justify-self-stretch py-1">
      <MarkdownMessage
        className="text-base leading-8 text-ink"
        content={event.content}
        streaming={event.streaming}
      />
      {shouldShowActions && <AgentMessageActions content={event.content} />}
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
        icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
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
          className="mt-3 pl-9 text-sm leading-7 text-ink-muted"
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

function ToolGroupCard({
  events,
  permissionDecision,
}: {
  events: ToolCallEvent[];
  permissionDecision: PermissionDecisionState;
}) {
  const runningCount = events.filter(
    (event) => event.status === "running",
  ).length;

  return (
    <details className="group min-w-0 py-1" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-ink-muted outline-none transition hover:text-ink [&::-webkit-details-marker]:hidden">
        {runningCount > 0 ? (
          <LoaderCircle className="h-4 w-4 animate-spin text-primary-hover" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-ink-tertiary" />
        )}
        <span>工具调用</span>
        <Badge className="font-mono">{String(events.length)}</Badge>
        {runningCount > 0 && (
          <Badge className="font-mono" tooltip={`${runningCount} running`}>
            {runningCount} running
          </Badge>
        )}
        <ChevronDown className="h-3.5 w-3.5 -rotate-90 text-ink-tertiary transition group-open:rotate-0" />
      </summary>
      <div className="mt-3 overflow-hidden rounded-lg border border-hairline bg-surface-1">
        {events.map((event) => (
          <ToolEventRow
            event={event}
            key={event.id}
            permissionDecision={permissionDecision}
          />
        ))}
      </div>
    </details>
  );
}

function ToolEventRow({
  event,
  permissionDecision,
}: {
  event: ToolCallEvent;
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
    const decision =
      permissionDecisionForPermission(permission, permissionDecision);
    return !decision;
  });

  return (
    <details
      className="group/tool min-w-0 border-b border-hairline last:border-b-0"
      open={hasPendingPermission}
    >
      <summary className="grid min-h-9 cursor-pointer list-none grid-cols-[16px_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-1.5 outline-none transition hover:bg-canvas/70 [&::-webkit-details-marker]:hidden">
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
        {event.permissions && event.permissions.length > 0 && (
          <section className="grid gap-2">
            <div className="text-xs uppercase tracking-wide text-ink-tertiary">
              Approval request
            </div>
            {event.permissions.map((permission) => (
              <PermissionRequestCard
                compactApproved={false}
                event={permission}
                key={permission.id}
                permissionDecision={permissionDecision}
              />
            ))}
          </section>
        )}
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
  permissionDecision,
}: {
  compactApproved?: boolean;
  event: Extract<SessionEvent, { type: "permission_request" }>;
  permissionDecision: PermissionDecisionState;
}) {
  const pending =
    permissionDecision.pending &&
    permissionDecision.pendingApprovalId === event.approvalId;
  const decided =
    permissionDecisionForPermission(event, permissionDecision);
  const approved = decided?.status === "approved";
  const denied = decided?.status === "denied";
  const approvedLabel = permissionDecisionLabel(decided);
  const canDecide =
    Boolean(event.approvalId) && !permissionDecision.pending && !decided;

  if (approved && compactApproved) {
    return (
      <article className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-success/70 bg-success/5 px-3 py-2.5">
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
      className={
        approved
          ? "min-w-0 rounded-lg border border-success/60 bg-success/5 p-3"
          : denied
            ? "min-w-0 rounded-lg border border-warning/50 bg-warning/5 p-3"
            : "min-w-0 rounded-lg border border-warning/40 bg-surface-1 p-3"
      }
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
      <div className="mt-4 flex flex-wrap gap-2">
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

function stringValue(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}
