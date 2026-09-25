import { AlertCircle, Clock3, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ComposerAttachmentStatus({
  uploading,
  error,
  onDismissError,
  waitingForTurn,
}: {
  uploading: boolean;
  error: Error | null;
  onDismissError?: () => void;
  waitingForTurn?: boolean;
}) {
  return (
    <>
      {uploading && (
        <div
          role="status"
          className="mb-2 flex items-center gap-2 px-1 text-xs text-ink-muted"
        >
          <LoaderCircle
            aria-hidden="true"
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
          />
          Uploading files…
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="mb-2 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 px-3 py-2"
        >
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-danger"
          />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium text-ink">Couldn’t attach files</p>
            <p className="mt-0.5 text-ink-muted">Try adding the file again.</p>
            <details className="mt-1 text-ink-tertiary">
              <summary className="cursor-pointer">Details</summary>
              <p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                {error.message}
              </p>
            </details>
          </div>
          {onDismissError && (
            <Button
              aria-label="Dismiss attachment error"
              className="h-6 w-6"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={onDismissError}
              size="icon"
              type="button"
              variant="ghost"
            />
          )}
        </div>
      )}
      {!uploading && !error && waitingForTurn && (
        <div
          role="status"
          className="mb-2 flex items-start gap-2 px-1 text-xs text-ink-muted"
        >
          <Clock3 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Attachments ready. Send when this turn finishes.
        </div>
      )}
    </>
  );
}
