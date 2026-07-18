"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Search, MessageCircle } from "lucide-react";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import { ApiError } from "@/features/api/errors";
import { useConversationMessages, useNodes } from "@/features/api/resources";
import { HistoryMessage, User } from "@/features/api/types";
import { compactId } from "@/lib/format";

type ConversationPageClientProps = {
  conversationId?: string;
  user: User;
};

export function ConversationPageClient({
  conversationId,
  user,
}: ConversationPageClientProps) {
  const router = useRouter();
  const [draftConversationId, setDraftConversationId] = useState(
    conversationId ?? "",
  );
  const nodesQuery = useNodes(user.user_id);
  const messagesQuery = useConversationMessages(
    user.user_id,
    conversationId,
    200,
  );
  const messages = useMemo(
    () => messagesQuery.data?.messages ?? [],
    [messagesQuery.data?.messages],
  );
  const title = conversationId
    ? `Conversation ${compactId(conversationId)}`
    : "Conversation";
  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const aId = a.id ?? 0;
        const bId = b.id ?? 0;
        if (aId !== bId) return aId - bId;
        return (a.created_at ?? "").localeCompare(b.created_at ?? "");
      }),
    [messages],
  );

  function openConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextId = draftConversationId.trim();
    if (!nextId) return;
    router.push(`/conversations/${encodeURIComponent(nextId)}`);
  }

  const error = messagesQuery.error ?? nodesQuery.error;

  return (
    <ConsoleLayout user={user}>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <MessageCircle className="h-4 w-4 text-ink-subtle" />
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary">
                  Settings
                </div>
                <h1 className="mt-1 text-lg font-semibold">{title}</h1>
              </div>
            </div>
            <Button
              disabled={!conversationId || messagesQuery.isFetching}
              icon={<RefreshCw className="h-4 w-4" />}
              onClick={() => void messagesQuery.refetch()}
              size="sm"
              type="button"
              variant="ghost"
            >
              Refresh
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] overflow-hidden">
          <aside className="min-h-0 overflow-y-auto border-r border-hairline bg-surface-1/60 p-4">
            <form className="grid gap-3" onSubmit={openConversation}>
              <label
                className="text-xs text-ink-tertiary"
                htmlFor="conversation-id"
              >
                Conversation id
              </label>
              <input
                className="h-9 rounded-md border border-hairline bg-canvas px-3 font-mono text-xs text-ink outline-none focus:border-hairline-strong"
                id="conversation-id"
                onChange={(event) => setDraftConversationId(event.target.value)}
                placeholder="conv_..."
                value={draftConversationId}
              />
              <Button
                disabled={!draftConversationId.trim()}
                icon={<Search className="h-4 w-4" />}
                type="submit"
                variant="primary"
              >
                Open
              </Button>
            </form>

            <div className="mt-6 grid gap-3 border-t border-hairline pt-4">
              <div>
                <div className="text-xs text-ink-tertiary">Loaded</div>
                <div className="mt-1 text-sm font-medium">
                  {conversationId ? `${messages.length} messages` : "No id"}
                </div>
              </div>
              {conversationId && (
                <div>
                  <div className="text-xs text-ink-tertiary">Current id</div>
                  <MonoId>{conversationId}</MonoId>
                </div>
              )}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-4">
            {error && (
              <div className="mb-4 border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
                {errorMessage(error)}
              </div>
            )}

            {!conversationId && (
              <div className="flex h-full items-center justify-center text-sm text-ink-tertiary">
                No conversation selected.
              </div>
            )}

            {conversationId && messagesQuery.isLoading && (
              <div className="text-sm text-ink-tertiary">Loading messages</div>
            )}

            {conversationId &&
              !messagesQuery.isLoading &&
              sortedMessages.length === 0 && (
                <div className="text-sm text-ink-tertiary">
                  No messages found for this conversation.
                </div>
              )}

            <div className="grid gap-3">
              {sortedMessages.map((message) => (
                <ConversationMessageCard
                  key={message.message_id}
                  message={message}
                />
              ))}
            </div>
          </section>
        </div>
      </main>
    </ConsoleLayout>
  );
}

function ConversationMessageCard({ message }: { message: HistoryMessage }) {
  const text = message.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n");
  const rawJson = message.raw_json
    ? JSON.stringify(message.raw_json, null, 2)
    : "";

  return (
    <article className="rounded-lg border border-hairline bg-surface-1 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge>{message.direction ?? message.role ?? "message"}</Badge>
        {message.status && (
          <Badge tone={statusTone(message.status)}>{message.status}</Badge>
        )}
        {message.message_type && <Badge>{message.message_type}</Badge>}
        <MonoId>{compactId(message.message_id)}</MonoId>
      </div>

      <div className="mt-2 grid gap-1 text-xs text-ink-tertiary sm:grid-cols-2 lg:grid-cols-4">
        <IdField label="agent" value={message.agent_id} />
        <IdField label="session" value={message.session_id} />
        <IdField label="turn" value={message.turn_id} />
        <IdField label="response" value={message.response_id} />
      </div>

      {text && (
        <div className="mt-3 whitespace-pre-wrap rounded-md border border-hairline bg-canvas px-3 py-2 text-sm leading-6 text-ink-muted">
          {text}
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-ink-tertiary">
          Details
        </summary>
        <pre className="mt-2 overflow-auto rounded-md border border-hairline bg-canvas p-3 text-xs leading-5 text-ink-subtle">
          {JSON.stringify(message, null, 2)}
        </pre>
        {rawJson && (
          <pre className="mt-2 overflow-auto rounded-md border border-hairline bg-canvas p-3 text-xs leading-5 text-ink-subtle">
            {rawJson}
          </pre>
        )}
      </details>
    </article>
  );
}

function IdField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <span>{label}: </span>
      {value ? (
        <TruncatedText className="inline font-mono">{value}</TruncatedText>
      ) : (
        <span className="text-ink-tertiary">none</span>
      )}
    </div>
  );
}

function statusTone(
  status: string,
): "neutral" | "success" | "warning" | "danger" {
  if (status === "received" || status === "completed") return "success";
  if (status === "failed" || status === "error") return "danger";
  return "neutral";
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return "Request failed";
}
