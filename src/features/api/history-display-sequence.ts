import type { HistoryMessage } from "./types";

export function historyDisplaySequence(message: HistoryMessage) {
  const sourceSeq = message.raw_json?.source_session_seq;
  if (
    message.message_type === "pax:artifact" &&
    typeof sourceSeq === "number" &&
    Number.isSafeInteger(sourceSeq) &&
    sourceSeq > 0 &&
    sourceSeq < (message.session_seq ?? 0)
  ) {
    return sourceSeq;
  }
  return message.session_seq ?? 0;
}
