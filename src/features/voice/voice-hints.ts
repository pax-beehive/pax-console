import type { SessionEvent } from "@/features/runtime/session-events";
import type { VoiceHints } from "./voice-session";

const MAX_CONTEXT_MESSAGES = 8;
const MAX_MESSAGE_CHARS = 300;
const MAX_KEYWORDS = 60;
const MAX_KEYWORD_CHARS = 64;

const CODE_SPAN = /`([^`\n]{2,64})`/g;
// Paths, file names, and host names: session-composer.tsx, docs/a.md.
const FILE_LIKE = /(?:[\w.-]+\/)*[\w-]{2,}\.[A-Za-z][A-Za-z0-9]{0,5}\b/g;
// camelCase, PascalCase with two or more humps, and snake_case identifiers.
const IDENTIFIER =
  /\b(?:[a-z]+(?:[A-Z][a-z0-9]+)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+|[a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;

/**
 * Recognition hints from the visible session: terms the user is likely to
 * say (file names, identifiers, code spans) and the latest messages, so the
 * speech provider spells project vocabulary correctly. Newest terms win.
 */
export function buildVoiceHints(events: readonly SessionEvent[]): VoiceHints {
  const keywords: string[] = [];
  const seen = new Set<string>();
  const addKeyword = (raw: string) => {
    const keyword = raw.trim();
    if (
      keywords.length >= MAX_KEYWORDS ||
      keyword.length < 2 ||
      keyword.length > MAX_KEYWORD_CHARS ||
      seen.has(keyword)
    )
      return;
    seen.add(keyword);
    keywords.push(keyword);
  };
  const newestMessages: string[] = [];
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.type === "file_change") {
      addKeyword(event.path.split("/").at(-1) ?? "");
      addKeyword(event.path);
      continue;
    }
    if (event.type !== "user_message" && event.type !== "agent_message")
      continue;
    const content = event.content.trim();
    if (!content) continue;
    for (const match of content.matchAll(CODE_SPAN)) addKeyword(match[1]);
    for (const match of content.matchAll(FILE_LIKE)) addKeyword(match[0]);
    for (const match of content.matchAll(IDENTIFIER)) addKeyword(match[0]);
    if (newestMessages.length < MAX_CONTEXT_MESSAGES) {
      const speaker = event.type === "user_message" ? "User" : "Agent";
      newestMessages.push(
        `${speaker}: ${squash(content).slice(0, MAX_MESSAGE_CHARS)}`,
      );
    }
  }
  return {
    keywords: keywords.length > 0 ? keywords : undefined,
    context: newestMessages.length > 0 ? newestMessages.reverse() : undefined,
  };
}

function squash(text: string) {
  return text.replace(/\s+/g, " ");
}
