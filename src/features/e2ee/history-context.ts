import type { HistoryMessage } from "../api/types";
import type { EncryptedHistoryPage } from "./transport";

// User prompts are immutable in the canonical E2EE projection. Keep a bounded,
// session-local cache so polling a long turn does not rescan its older pages.
// The runtime replaces this cache whenever the route or root key changes.
export class EncryptedPromptCache {
  private prompts = new Map<string, HistoryMessage>();

  remember(message: HistoryMessage) {
    if (
      !isUserPrompt(message) ||
      !hasPromptContent(message) ||
      !message.turn_id
    )
      return;
    const current = this.prompts.get(message.turn_id);
    if (current && (current.revision ?? 0) > (message.revision ?? 0)) return;
    this.prompts.delete(message.turn_id);
    this.prompts.set(message.turn_id, message);
    while (this.prompts.size > 64) {
      this.prompts.delete(this.prompts.keys().next().value!);
    }
  }

  get(turnId: string) {
    return this.prompts.get(turnId);
  }
}

function hasPromptContent(message: HistoryMessage) {
  if (message.parts?.some((part) => Boolean(part.text))) return true;
  const params = message.raw_json?.params;
  if (!params || typeof params !== "object" || Array.isArray(params))
    return false;
  const prompt = (params as Record<string, unknown>).prompt;
  return (
    Array.isArray(prompt) &&
    prompt.some(
      (block) =>
        block &&
        typeof block === "object" &&
        (block.type === "resource_link" ||
          (block.type === "text" && Boolean(block.text))),
    )
  );
}

function isUserPrompt(message: HistoryMessage) {
  return message.role === "user" || message.message_type === "user_message";
}

// Match ordinary history's base-page/context distinction without exposing role
// or turn metadata to Manager. Only authenticated, decrypted messages enter here.
export async function withEncryptedPromptContext(
  base: EncryptedHistoryPage,
  loadOlder: (beforeId: number) => Promise<EncryptedHistoryPage>,
  cache = new EncryptedPromptCache(),
): Promise<EncryptedHistoryPage> {
  const wanted = new Set(
    base.messages
      .map((message) => message.turn_id)
      .filter(
        (turn): turn is string => Boolean(turn) && turn !== "turn_unbound",
      ),
  );
  const context = new Map<string, HistoryMessage>();
  const observe = (messages: HistoryMessage[]) => {
    for (const message of messages) {
      cache.remember(message);
      if (
        isUserPrompt(message) &&
        hasPromptContent(message) &&
        message.turn_id &&
        wanted.has(message.turn_id)
      ) {
        context.set(message.turn_id, message);
        wanted.delete(message.turn_id);
      }
    }
  };
  observe(base.messages);
  for (const turn of wanted) {
    const prompt = cache.get(turn);
    if (prompt) {
      context.set(turn, prompt);
      wanted.delete(turn);
    }
  }

  let page = base;
  let previousCursor = Number.POSITIVE_INFINITY;
  while (wanted.size && page.pagination.has_more) {
    const cursor = page.pagination.next_before_id;
    if (
      !Number.isSafeInteger(cursor) ||
      cursor <= 0 ||
      cursor >= previousCursor
    ) {
      throw new Error("Encrypted history pagination did not advance");
    }
    previousCursor = cursor;
    page = await loadOlder(cursor);
    observe(page.messages);
  }

  const messages = new Map(
    base.messages.map((message) => [message.message_id, message]),
  );
  for (const prompt of context.values()) {
    if (!messages.has(prompt.message_id))
      messages.set(prompt.message_id, prompt);
  }
  return {
    messages: [...messages.values()].sort((a, b) => (a.id ?? 0) - (b.id ?? 0)),
    // Older tool rows remain reachable even when we fetched past them to find
    // a prompt. Never replace this with the context scan's final cursor.
    pagination: base.pagination,
  };
}
