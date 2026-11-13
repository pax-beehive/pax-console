"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { normalizeAgentType } from "@/components/settings/agent-types";
import { isAgentAuthenticationError } from "@/features/runtime/agent-auth-error";

export function SessionAuthenticationNotice({
  error,
  nodeId,
  sessionId,
  agentType,
}: {
  error?: Error | null;
  nodeId?: string;
  sessionId?: string;
  agentType?: string;
}) {
  const { t } = useI18n();
  // Sign-in is keyed by the session's PAX agent type.
  const harness = normalizeAgentType(agentType);
  if (!nodeId || !harness || !isAgentAuthenticationError(error)) return null;

  const params = new URLSearchParams({ node_id: nodeId, harness });
  if (sessionId) params.set("session_id", sessionId);

  return (
    <div
      className="flex min-w-0 flex-wrap items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
      role="alert"
    >
      <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium text-ink">{t("Sign-in required")}</p>
        <p className="mt-1 text-ink-muted">
          {t(
            "The agent needs you to sign in again on this device. Complete sign-in in Settings, then return here and retry your message.",
          )}
        </p>
      </div>
      <Button asChild className="min-h-11" variant="secondary">
        <Link href={`/settings/agent-sign-in?${params}`}>
          {t("Open Agent sign-in")}
        </Link>
      </Button>
    </div>
  );
}
