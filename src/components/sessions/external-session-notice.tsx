"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  externalSessionNoticeKey,
  useSessionNoticeStore,
} from "@/stores/session-notice-store";

export function ExternalSessionNotice({
  userId,
  agentId,
  sessionId,
}: {
  userId: string;
  agentId: string;
  sessionId: string;
}) {
  const { t } = useI18n();
  const key = externalSessionNoticeKey(userId, agentId, sessionId);
  const dismissed = useSessionNoticeStore((state) => state.dismissed[key]);
  const dismiss = useSessionNoticeStore((state) => state.dismiss);

  if (dismissed) return null;

  return (
    <div className="border-t border-warning/30 bg-warning/10 px-3 py-2 text-xs text-ink-muted sm:px-4">
      <div className="mx-auto flex w-full max-w-4xl items-start gap-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="min-w-0 flex-1">
          {t(
            "This session was started outside Pax. You can continue chatting here, but messages sent from Pax may not appear in the original app.",
          )}
        </p>
        <Button
          aria-label={t("Dismiss external session notice")}
          className="-my-1 h-7 w-7"
          icon={<X className="h-3.5 w-3.5" />}
          onClick={() => dismiss(key)}
          size="icon"
          type="button"
          variant="ghost"
        />
      </div>
    </div>
  );
}
