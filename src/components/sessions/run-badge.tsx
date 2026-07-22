"use client";

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  LoaderCircle,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ConversationRunStatus } from "@/features/runtime/use-conversation-run";

export function RunBadge({
  error,
  status,
}: {
  error?: Error | null;
  status: ConversationRunStatus;
}) {
  const errorDetail = status === "error" && error ? formatError(error) : null;
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

function formatError(error: Error) {
  return error.name ? `${error.name}: ${error.message}` : error.message;
}
