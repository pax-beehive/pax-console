import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useMessageDetail } from "@/features/api/resources";
import type { ToolCallEvent } from "@/features/runtime/session-events";
import { textFromToolPayload } from "@/features/runtime/tool-call-output";

export function ToolMessageDetails({
  event,
  userId,
}: {
  event: ToolCallEvent;
  userId?: string;
}) {
  return (
    <div className="grid gap-3">
      {event.historyDetails?.map((detail) => (
        <div className="grid gap-3" key={detail.messageId}>
          <MessageDetailSection
            userId={userId}
            complete={event.status === "done" || event.status === "error"}
            sessionId={event.sessionId}
            detail={detail}
            section="input"
          />
          <MessageDetailSection
            userId={userId}
            complete={event.status === "done" || event.status === "error"}
            sessionId={event.sessionId}
            detail={detail}
            section="output"
          />
        </div>
      ))}
    </div>
  );
}

function MessageDetailSection({
  userId,
  complete,
  sessionId,
  detail,
  section,
}: {
  userId?: string;
  complete: boolean;
  sessionId: string;
  detail: { messageId: string; updatedAt?: string };
  section: "input" | "output";
}) {
  const client = useQueryClient();
  const query = useMessageDetail(
    userId,
    sessionId,
    detail.messageId,
    section,
    detail.updatedAt,
    complete,
  );
  const pages = query.data?.pages;
  const raw = pages?.map((page) => page.text).join("") ?? "";
  let text = raw;
  if (pages?.[0]?.format === "json" && !pages.at(-1)?.has_more) {
    try {
      const value: unknown = JSON.parse(raw);
      if (value === null) text = "";
      else text = textFromToolPayload(value) ?? JSON.stringify(value, null, 2);
    } catch {
      /* An incomplete page is displayed as text until explicitly continued. */
    }
  }
  if (query.isSuccess && !text && !query.hasNextPage) return null;
  return (
    <section className="grid gap-2">
      <div className="text-xs uppercase tracking-wide text-ink-tertiary">
        {section === "input" ? "Input" : "Output"}
      </div>
      {!userId ? (
        <p className="text-xs text-ink-tertiary">Sign in to load details.</p>
      ) : query.isPending ? (
        <p className="text-xs text-ink-tertiary">Loading details...</p>
      ) : null}
      {text && (
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-hairline bg-surface-1 p-3 text-xs leading-5 text-ink-muted">
          {text}
        </pre>
      )}
      {query.isError && (
        <div className="text-xs text-danger">
          <p>{query.error.message}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void client.resetQueries({
                queryKey: [
                  "message-detail",
                  userId,
                  sessionId,
                  detail.messageId,
                  section,
                  detail.updatedAt,
                  complete,
                ],
                exact: true,
              })
            }
          >
            Reload details
          </Button>
        </div>
      )}
      {query.hasNextPage && !query.isError && (
        <Button
          size="sm"
          variant="secondary"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </section>
  );
}
