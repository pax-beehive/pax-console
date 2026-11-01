import { Button } from "@/components/ui/button";
import { ApiError, AuthError } from "@/features/api/errors";
import { SessionMessageUnavailableError } from "@/features/runtime/session-message-window";

export function SessionMessageTargetNotice({
  loading,
  error,
  missing,
  focused,
  onRetry,
  onLatest,
}: {
  loading: boolean;
  error: Error | null;
  missing: boolean;
  focused: boolean;
  onRetry: () => void;
  onLatest: () => void;
}) {
  const unavailable =
    missing ||
    error instanceof SessionMessageUnavailableError ||
    error instanceof AuthError ||
    (error instanceof ApiError && [401, 403, 404].includes(error.status));
  return (
    <div
      className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-hairline bg-surface-1 px-3 py-2 text-xs sm:px-4"
      role={error || missing ? "alert" : "status"}
    >
      <span className="min-w-0 text-ink-muted">
        {loading
          ? "Finding message…"
          : unavailable
            ? "This message was removed or is no longer available to you."
            : error
              ? "Could not load this message. Please try again."
              : focused
                ? "Showing history around the selected message."
                : "Selected message"}
      </span>
      <div className="flex shrink-0 gap-1">
        {error && !unavailable && (
          <Button size="sm" onClick={onRetry}>
            Retry message
          </Button>
        )}
        <Button size="sm" onClick={onLatest}>
          Back to latest
        </Button>
      </div>
    </div>
  );
}
