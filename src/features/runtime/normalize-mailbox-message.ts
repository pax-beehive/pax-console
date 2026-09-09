import { MailboxMessage } from "@/features/api/types";
import { SessionEvent } from "./session-events";

export function normalizeMailboxMessage(
  message: MailboxMessage,
): SessionEvent[] {
  const sessionId = message.session_id ?? "unknown-session";
  const createdAt = message.created_at ?? new Date().toISOString();
  const id = message.message_id ?? String(message.id ?? crypto.randomUUID());
  const content = message.message ?? message.result ?? message.error ?? "";
  const direction = message.direction?.toLowerCase();

  const events: SessionEvent[] = [];

  if (content) {
    events.push({
      type:
        direction === "inbound" || direction === "user"
          ? "user_message"
          : "agent_message",
      id,
      sessionId,
      content,
      createdAt,
    });
  }

  for (const [index, change] of message.file_changes?.entries() ?? []) {
    if (!change.path) {
      continue;
    }

    events.push({
      type: "file_change",
      id: `${id}:file:${index}`,
      sessionId,
      path: change.path,
      tool: change.tool,
      oldContent: change.old_content,
      newContent: change.new_content,
      createdAt,
    });
  }

  if (message.token_usage) {
    events.push({
      type: "token_usage",
      id: `${id}:tokens`,
      sessionId,
      inputTokens: message.token_usage.input_tokens,
      cacheReadTokens: message.token_usage.cache_read_tokens,
      cacheWriteTokens: message.token_usage.cache_write_tokens,
      cacheCreationTokens: message.token_usage.cache_creation_tokens,
      outputTokens: message.token_usage.output_tokens,
      reasoningTokens: message.token_usage.reasoning_tokens,
      totalTokens: message.token_usage.total_tokens,
      costUsd:
        message.token_usage.actual_cost_usd ??
        message.token_usage.cost_usd ??
        message.token_usage.estimated_cost_usd,
      createdAt,
    });
  }

  return events;
}
