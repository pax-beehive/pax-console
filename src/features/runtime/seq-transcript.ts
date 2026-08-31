import { HistoryMessage } from "@/features/api/types";

/**
 * The session-scoped ordering key assigned by the manager. It is the single key
 * used to order and dedup the transcript; live and durable copies of the same
 * message share it, so the client never has to re-sequence by heuristics.
 */
export function seqOf(message: HistoryMessage): number {
  return message.session_seq ?? 0;
}

function contentWeight(message: HistoryMessage): number {
  const revision = message.revision ?? 0;
  const textLength = (message.parts ?? []).reduce(
    (sum, part) => sum + (part.text?.length ?? 0),
    0,
  );
  return revision * 1_000_000 + textLength;
}

/**
 * Merge durable history and live items into one seq-ordered, deduped transcript.
 *
 * Ordering is purely by `session_seq` (ties broken by durable `id`), so live
 * events and refetched history agree on order with no per-turn repositioning.
 * Duplicates (a message present both live and durable) collapse by
 * `message_id`, keeping the more complete copy — later revision, then longer
 * assembled text, then later arrival — which lets a growing aggregated message
 * converge on its final text without flicker.
 */
export function mergeSeqTranscript(items: HistoryMessage[]): HistoryMessage[] {
  const byMessageId = new Map<string, HistoryMessage>();
  for (const item of items) {
    const key = item.message_id;
    if (!key) {
      continue;
    }
    const existing = byMessageId.get(key);
    if (!existing || contentWeight(item) >= contentWeight(existing)) {
      byMessageId.set(key, item);
    }
  }
  return [...byMessageId.values()].sort(
    (a, b) => seqOf(a) - seqOf(b) || (a.id ?? 0) - (b.id ?? 0),
  );
}

/** The highest seq the client currently holds — its watermark. */
export function localMaxSeq(items: HistoryMessage[]): number {
  return items.reduce((max, item) => Math.max(max, seqOf(item)), 0);
}

/** Whether the server's head advertises transcript the client has not pulled. */
export function isBehind(headSeq: number, localMax: number): boolean {
  return headSeq > localMax;
}
