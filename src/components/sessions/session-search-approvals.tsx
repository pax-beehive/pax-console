"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/inline-error";
import {
  decideApproval,
  listTurnSearchApprovals,
} from "@/features/api/resources";
import { queryKeys } from "@/features/api/query-keys";
import type { AgentApproval } from "@/features/api/types";

export function SessionSearchApprovals({
  userId,
  agentId,
  sessionId,
  turnId,
}: {
  userId: string;
  agentId: string;
  sessionId: string;
  turnId?: string;
}) {
  const queryClient = useQueryClient();
  const [resolved, setResolved] = useState<string[]>([]);
  const [deadlineTime, setDeadlineTime] = useState(0);
  const query = useQuery({
    queryKey: queryKeys.turnSearchApprovals(
      userId,
      agentId,
      sessionId,
      turnId ?? "",
    ),
    queryFn: ({ signal }) =>
      listTurnSearchApprovals(userId, agentId, sessionId, turnId!, signal),
    enabled: Boolean(turnId && !turnId.startsWith("pending-turn:")),
    refetchInterval: turnId ? 5_000 : false,
  });
  const decision = useMutation({
    mutationFn: ({
      id,
      option,
    }: {
      id: string;
      option: "allow_once" | "deny";
    }) => decideApproval(userId, id, option),
    onSuccess: (_, { id }) => {
      setResolved((current) => [...current, id]);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvals(userId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.approvalGrants(userId),
      });
    },
  });
  const requests =
    !query.isError && turnId
      ? (query.data?.approvals ?? []).filter(
          (approval) =>
            isPendingTurnSearchApproval(
              approval,
              Math.max(query.dataUpdatedAt, deadlineTime),
            ) &&
            approval.request_agent_id === agentId &&
            approval.request_session_id === sessionId &&
            approval.resource_ref === turnId &&
            !resolved.includes(approval.approval_id),
        )
      : [];
  const nextExpiry = Math.min(
    ...requests.flatMap((approval) =>
      approval.expires_at ? [Date.parse(approval.expires_at)] : [],
    ),
  );
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = window.setTimeout(
      () => setDeadlineTime(Date.now()),
      Math.max(0, nextExpiry - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [nextExpiry]);
  if (!requests.length) return null;
  return (
    <section
      aria-label="Search scope requests"
      className="max-h-64 shrink-0 overflow-auto border-b border-hairline bg-surface px-3 py-3 sm:px-4"
    >
      <h3 className="text-sm font-medium">Search scope requests</h3>
      <p className="mt-1 text-xs leading-5 text-ink-muted">
        Extra access applies only to this turn and ends when it finishes or is
        stopped. The agent can continue working or cancel the request while you
        decide.
      </p>
      {requests.map((approval) => {
        const scope = approval.request_body?.scope;
        const fields =
          typeof scope === "object" && scope !== null && !Array.isArray(scope)
            ? (scope as Record<string, unknown>)
            : {};
        const queries = scopeLabel(fields.queries, "Any query");
        const nodes =
          scopeLabel(fields.node_ids ?? ["*"], "All your nodes", {
            self: "Calling node",
          }) || "Unknown node scope";
        const agents =
          scopeLabel(fields.agent_ids ?? ["*"], "All your agents", {
            self: "Calling agent",
          }) || "Unknown agent scope";
        const sessions = scopeLabel(
          fields.session_ids,
          "All sessions of selected agents",
        );
        return (
          <div
            className="mt-3 grid gap-2 rounded-lg border border-hairline p-3"
            key={approval.approval_id}
          >
            <p className="text-sm font-medium">
              {approval.title ?? "Expand search scope"}
            </p>
            {approval.description && (
              <p className="text-xs leading-5 text-ink-muted">
                {approval.description}
              </p>
            )}
            {queries && (
              <p className="break-words text-xs text-ink-muted">
                Queries: {queries}
              </p>
            )}
            <p className="break-words text-xs text-ink-muted">Nodes: {nodes}</p>
            <p className="break-words text-xs text-ink-muted">
              Agents: {agents}
            </p>
            {sessions && (
              <p className="break-words text-xs text-ink-muted">
                Sessions: {sessions}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                disabled={decision.isPending}
                onClick={() =>
                  decision.mutate({
                    id: approval.approval_id,
                    option: "allow_once",
                  })
                }
              >
                Allow this turn
              </Button>
              <Button
                size="sm"
                disabled={decision.isPending}
                onClick={() =>
                  decision.mutate({ id: approval.approval_id, option: "deny" })
                }
              >
                Deny
              </Button>
            </div>
            {decision.error &&
              decision.variables?.id === approval.approval_id && (
                <InlineError error={decision.error} />
              )}
          </div>
        );
      })}
    </section>
  );
}

export function isTurnSearchApproval(approval: AgentApproval) {
  return (
    approval.domain === "workspace" &&
    approval.operation === "search" &&
    approval.resource_type === "turn"
  );
}

export function isPendingTurnSearchApproval(
  approval: AgentApproval,
  observedAt: number,
) {
  return (
    isTurnSearchApproval(approval) &&
    approval.status === "pending" &&
    !approval.grant_revoked_at &&
    (!approval.expires_at || Date.parse(approval.expires_at) > observedAt)
  );
}

function scopeLabel(
  value: unknown,
  wildcard: string,
  aliases: Record<string, string> = {},
) {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === "string")
  )
    return undefined;
  return value.length === 1 && value[0] === "*"
    ? wildcard
    : value.map((entry) => aliases[entry] ?? entry).join(", ");
}
