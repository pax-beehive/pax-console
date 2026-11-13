"use client";

import { useI18n } from "@/features/i18n/use-i18n";

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
import type { SessionDisplayStatus } from "@/features/runtime/session-display-status";
import { cn } from "@/lib/utils";

export function RunBadge({
  compact = false,
  error,
  paxdOffline,
  status,
}: {
  compact?: boolean;
  error?: Error | null;
  paxdOffline?: boolean;
  status: SessionDisplayStatus;
}) {
  const { t } = useI18n();
  if (paxdOffline) {
    return (
      <Badge
        tone="warning"
        tooltip={t(
          "paxd is offline. The last reported execution state is retained.",
        )}
      >
        {t("paxd offline")}
      </Badge>
    );
  }
  const errorDetail =
    status === "error" && error ? formatErrorDetail(error) : null;
  const isIdleTimeout = status === "error" && isConversationIdleTimeout(error);
  const statusConfig = {
    idle: {
      icon: <Circle className="h-3.5 w-3.5" />,
      label: t("idle"),
      tone: "neutral" as const,
      tooltip: t("Ready for a prompt"),
    },
    streaming: {
      icon: <LoaderCircle className="h-3.5 w-3.5 animate-spin" />,
      label: t("running"),
      tone: "warning" as const,
      tooltip: t("Agent is responding"),
    },
    waiting_approval: {
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
      label: t("approval"),
      tone: "warning" as const,
      tooltip: t("Waiting for approval"),
    },
    unknown: {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      label: t("status unknown"),
      tone: "warning" as const,
      tooltip: t("No authoritative runtime state is available"),
    },
    done: {
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: t("done"),
      tone: "success" as const,
      tooltip: t("Run completed"),
    },
    cancelled: {
      icon: <Circle className="h-3.5 w-3.5" />,
      label: t("cancelled"),
      tone: "neutral" as const,
      tooltip: t("Run cancelled"),
    },
    error: {
      icon: <AlertCircle className="h-3.5 w-3.5" />,
      label: error ? `${t("error")} · ${error.message}` : t("error"),
      tone: "danger" as const,
      tooltip: errorDetail ?? t("Run failed"),
    },
  }[status];

  if (status === "error") {
    const detail = errorDetail ?? t("The session stream failed.");
    const label = isIdleTimeout ? t("inactive") : t("error");

    return (
      <details className="group relative shrink-0">
        <summary
          aria-label={t("Session {status}: {detail}", {
            status: label,
            detail,
          })}
          className="cursor-pointer list-none rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
        >
          <Badge
            className="max-w-40 px-2 py-1 font-medium"
            tone={isIdleTimeout ? "neutral" : statusConfig.tone}
          >
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap [&_svg]:shrink-0">
              {statusConfig.icon}
              {label}
            </span>
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
      className={cn(
        "max-w-40 px-2 py-1 font-medium",
        compact && "border-transparent bg-transparent px-0 text-[11px]",
      )}
      tone={statusConfig.tone}
      tooltip={statusConfig.tooltip}
    >
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap [&_svg]:shrink-0">
        {statusConfig.icon}
        {statusConfig.label}
      </span>
    </Badge>
  );
}
