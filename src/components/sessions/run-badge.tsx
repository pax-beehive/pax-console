"use client";

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatErrorDetail } from "@/features/api/errors";
import { isConversationIdleTimeout } from "@/features/runtime/session-display-status";
import type { ConversationRunStatus } from "@/features/runtime/use-conversation-run";
import { cn } from "@/lib/utils";

export function RunBadge({
  error,
  status,
}: {
  error?: Error | null;
  status: ConversationRunStatus;
}) {
  const errorDetail =
    status === "error" && error ? formatErrorDetail(error) : null;
  const isIdleTimeout = status === "error" && isConversationIdleTimeout(error);
  const statusConfig = {
    idle: {
      icon: <Circle className="h-3.5 w-3.5" />,
      label: "idle",
      tone: "neutral" as const,
      tooltip: "Ready for a prompt",
    },
    streaming: {
      icon: <LoaderCircle className="h-3.5 w-3.5 animate-spin" />,
      label: "running",
      tone: "warning" as const,
      tooltip: "Agent is responding",
    },
    waiting_approval: {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      label: "approval",
      tone: "warning" as const,
      tooltip: "Waiting for approval",
    },
    done: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: "done",
      tone: "success" as const,
      tooltip: "Run completed",
    },
    error: {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      label: error ? `error · ${error.message}` : "error",
      tone: "danger" as const,
      tooltip: errorDetail ?? "Run failed",
    },
  }[status];

  if (status === "error") {
    const detail = errorDetail ?? "The session stream failed.";
    const label = isIdleTimeout ? "inactive" : "error";

    return (
      <details className="group relative">
        <summary
          aria-label={`Session ${isIdleTimeout ? "inactive" : "error"}: ${detail}`}
          className="cursor-pointer list-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
        >
          <Badge
            className="max-w-40 px-2 py-1 font-medium"
            tone={isIdleTimeout ? "neutral" : statusConfig.tone}
          >
            {statusConfig.icon}
            {label}
          </Badge>
        </summary>
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 hidden w-[min(80vw,24rem)] rounded-md border bg-surface-3 px-3 py-2",
            isIdleTimeout ? "border-hairline" : "border-danger/30",
            "text-xs leading-5 text-ink-muted shadow-xl shadow-black/30 [overflow-wrap:anywhere]",
            "group-open:block sm:group-hover:block",
          )}
          role={isIdleTimeout ? "status" : "alert"}
        >
          {detail}
        </div>
      </details>
    );
  }

  return (
    <Badge
      aria-label={statusConfig.tooltip}
      className="max-w-40 px-2 py-1 font-medium"
      tone={statusConfig.tone}
      tooltip={statusConfig.tooltip}
    >
      {statusConfig.icon}
      {statusConfig.label}
    </Badge>
  );
}
