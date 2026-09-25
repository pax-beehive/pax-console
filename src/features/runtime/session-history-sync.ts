import type { AgentSession, HistoryMessage } from "../api/types";
import { listSessionHistory } from "../api/resources";

export type HistorySyncState = {
  messages: HistoryMessage[];
  calibratedTurnIds: string[];
  snapshotTurnIds?: string[];
};

export const emptyHistorySync: HistorySyncState = {
  messages: [],
  calibratedTurnIds: [],
};

export function mergeSyncedHistory(
  history: HistoryMessage[],
  sync: HistorySyncState,
) {
  const replacedTurns = new Set([
    ...sync.calibratedTurnIds,
    ...(sync.snapshotTurnIds ?? []),
  ]);
  const byId = new Map(
    history
      .filter((m) => !m.turn_id || !replacedTurns.has(m.turn_id))
      .map((m) => [m.message_id, m]),
  );
  for (const message of sync.messages) byId.set(message.message_id, message);
  return [...byId.values()].sort(
    (a, b) => (a.session_seq ?? 0) - (b.session_seq ?? 0),
  );
}

// Publish only after every requested page succeeds; partial reads never own a turn.
export async function syncSessionHistory({
  userId,
  sessionId,
  session,
  history,
  current = emptyHistorySync,
  turnIds = [],
  refreshTail = false,
  read = listSessionHistory,
}: {
  userId: string;
  sessionId: string;
  session?: AgentSession;
  history: HistoryMessage[];
  current?: HistorySyncState;
  turnIds?: string[];
  refreshTail?: boolean;
  read?: typeof listSessionHistory;
}): Promise<HistorySyncState> {
  const known = mergeSyncedHistory(history, current);
  let messages = [...current.messages];
  const calibrated = new Set(current.calibratedTurnIds);
  const snapshots = new Set(current.snapshotTurnIds ?? []);
  const requestedTurns = new Set(
    turnIds.filter((id) => id && !id.startsWith("pending-turn:")),
  );
  const targets = new Set(requestedTurns);
  const idle = session?.runtime_status === "idle";
  if (idle && session.latest_turn_id) targets.add(session.latest_turn_id);
  const missingHead =
    idle &&
    session.latest_message_id &&
    !known.some((m) => m.message_id === session.latest_message_id);

  // Head IDs/seqs are ordering keys, not content versions. Legacy idle
  // sessions without a turn head must re-read the tail even when IDs match.
  if (refreshTail || missingHead || (idle && !session.latest_turn_id)) {
    const seqs = [...new Set(known.map((m) => m.session_seq ?? 0))].sort(
      (a, b) => a - b,
    );
    let afterSeq = seqs.length > 1 ? seqs[seqs.length - 2] : 0;
    for (;;) {
      const page = await read(userId, sessionId, 100, { afterSeq });
      // A tail page cannot replace a whole calibrated turn. Stage it for a
      // complete paginated read instead, including same-ID part updates.
      messages = mergeSyncedHistory(messages, {
        messages: (page.messages ?? []).filter(
          (m) =>
            !m.turn_id ||
            (!calibrated.has(m.turn_id) && !snapshots.has(m.turn_id)),
        ),
        calibratedTurnIds: [],
      });
      for (const m of page.messages ?? []) {
        if (
          m.turn_id &&
          (m.message_type === "turn_done" ||
            calibrated.has(m.turn_id) ||
            snapshots.has(m.turn_id))
        )
          targets.add(m.turn_id);
      }
      if (!page.pagination?.has_newer) break;
      const next = page.pagination.next_after_seq ?? 0;
      if (next <= afterSeq) throw new Error("History cursor did not advance");
      afterSeq = next;
    }
  }
  const latestCompleted = known.findLast(
    (message) => message.message_type === "turn_done" && message.turn_id,
  );
  if (latestCompleted?.turn_id) targets.add(latestCompleted.turn_id);
  for (const turnId of targets) {
    // Calibration establishes ownership over live fragments, not immutability.
    // Parts can change without any new message ID, seq, or turn ID.
    if (
      calibrated.has(turnId) &&
      !idle &&
      !refreshTail &&
      !requestedTurns.has(turnId)
    )
      continue;
    let beforeSeq = 0;
    const turnMessages: HistoryMessage[] = [];
    for (;;) {
      const page = await read(userId, sessionId, 100, { turnId, beforeSeq });
      if ((page.messages ?? []).some((m) => m.turn_id !== turnId)) {
        throw new Error("History returned messages from another turn");
      }
      turnMessages.push(...(page.messages ?? []));
      if (!page.pagination?.has_older) break;
      const next = page.pagination.next_before_seq ?? 0;
      if (next <= 0 || (beforeSeq > 0 && next >= beforeSeq)) {
        throw new Error("Turn history cursor did not advance");
      }
      beforeSeq = next;
    }
    const complete = turnMessages.some((m) => m.message_type === "turn_done");
    // A fully paginated idle snapshot is usable history even when the API
    // has no synthetic completion row. Keep runtime completion separate.
    if (!complete && (!idle || turnMessages.length === 0)) continue;
    messages = [
      ...messages.filter((m) => m.turn_id !== turnId),
      ...turnMessages,
    ];
    snapshots.add(turnId);
    if (complete) calibrated.add(turnId);
  }
  return {
    messages,
    calibratedTurnIds: [...calibrated],
    snapshotTurnIds: [...snapshots],
  };
}
