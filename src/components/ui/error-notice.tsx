"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import { AlertCircle } from "lucide-react";
import { formatErrorDetail, UserMessageError } from "@/features/api/errors";
import { isInputError, publicErrorMessage } from "@/features/api/public-error";
import { useAdminView } from "@/features/auth/use-admin-view";
import { cn } from "@/lib/utils";

/**
 * A failed request in words the person can act on. Administrators also see
 * the server's own message; everyone sees it when it explains what was wrong
 * with their input.
 */
export function ErrorNotice({
  className,
  error,
}: {
  className?: string;
  error: unknown;
}) {
  const { t } = useI18n();
  const admin = useAdminView();
  if (!error) return null;
  const detail =
    !(error instanceof Error) || error instanceof UserMessageError
      ? undefined
      : admin
        ? formatErrorDetail(error)
        : isInputError(error)
          ? error.message
          : undefined;
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-2 text-sm text-warning",
        className,
      )}
      role="alert"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">
        <p>{t(publicErrorMessage(error))}</p>
        {detail && (
          <p className="mt-0.5 break-words font-mono text-xs text-ink-tertiary">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
