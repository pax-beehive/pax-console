import { API_BASE_URL } from "../api/client";
import { ApiError } from "../api/errors";
import { mergeEvents } from "../runtime/merge-session-events";
import { normalizeHistoryMessage } from "../runtime/normalize-history-message";
import { normalizeTunnelFrame } from "../runtime/normalize-tunnel-frame";
import type { SessionEvent } from "../runtime/session-events";
import {
  reconcileEncryptedTimeline,
  normalizeEncryptedHistory,
} from "./reconcile-history";
import { decryptEnvelope, type EncryptedEnvelope } from "./envelope";
import type { EncryptedAttachment } from "./attachments";
import {
  checkedJSONResponse,
  encryptedSessionPath,
  loadEncryptedSessionHistory,
  type EncryptedHistoryPage,
  type EncryptedEventContext,
  type LoadEncryptedHistoryOptions,
} from "./transport";

export type EncryptedReplayPage = EncryptedHistoryPage & {
  replayEvents: SessionEvent[];
  headCursor: number;
  turnRef: string;
};
type ReplayResponse = {
  events: { cursor: number; created_at: string; envelope: EncryptedEnvelope }[];
  turn_ref: string;
  turn_start_cursor: number;
  head_cursor: number;
  next_after_cursor: number;
  has_more: boolean;
  has_older: boolean;
};

// A turn can span many HTTP pages. Publish it only after every page validates;
// live SSE starts at the original snapshot head, including arrivals during replay.
export async function loadEncryptedTurn(
  options: LoadEncryptedHistoryOptions,
): Promise<EncryptedReplayPage> {
  let after = 0;
  let snapshot: ReplayResponse | undefined;
  let events: SessionEvent[] = [];
  const replayTurns = new Set<string | undefined>();
  do {
    options.signal?.throwIfAborted();
    const params = new URLSearchParams({ view: "replay", limit: "100" });
    if (snapshot) {
      params.set("through_cursor", String(snapshot.head_cursor));
      params.set("turn_ref", snapshot.turn_ref);
      params.set("after_cursor", String(after));
    } else if (options.beforeId) {
      params.set("before_turn", String(options.beforeId));
    }
    const response = await fetch(
      `${API_BASE_URL}${encryptedSessionPath(options.userId, options.agentId, options.sessionId, "encrypted-events")}?${params}`,
      { credentials: "include", redirect: "manual", signal: options.signal },
    );
    if (
      response.ok &&
      !response.headers.get("content-type")?.includes("application/json")
    ) {
      await response.body?.cancel();
      throw new ApiError(
        "Manager does not support encrypted turn replay",
        501,
        null,
      );
    }
    const page = await checkedJSONResponse<ReplayResponse>(response);
    validateReplayPage(page, snapshot, after);
    snapshot ??= page;
    const normalized: SessionEvent[] = [];
    for (const stored of page.events) {
      const e = stored.envelope;
      if (
        e.agent_id !== options.agentId ||
        e.session_id !== options.sessionId ||
        e.kind !== "acp_event" ||
        (options.keyEpoch !== undefined && e.key_epoch !== options.keyEpoch)
      )
        throw new Error("Encrypted replay route mismatch");
      const batch = JSON.parse(
        new TextDecoder().decode(
          await decryptEnvelope(options.rootKey, "event", e),
        ),
      ) as { turn_id?: string; frames: unknown[] };
      if (page.turn_ref && batch.turn_id !== page.turn_ref)
        throw new Error("Encrypted replay turn reference mismatch");
      if (!Array.isArray(batch.frames))
        throw new Error("Encrypted replay frames are missing");
      replayTurns.add(batch.turn_id);
      normalized.push(
        ...batch.frames.flatMap((frame) =>
          normalizeReplayFrame(
            frame,
            options.sessionId,
            { turnId: batch.turn_id },
            stored.created_at,
          ),
        ),
      );
    }
    events = mergeEvents([...events, ...normalized]);
    options.signal?.throwIfAborted();
    after = page.next_after_cursor;
    if (!page.has_more) break;
    // Yield between bounded pages so long tool-heavy turns do not monopolize UI work.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  } while (true);
  const legacy =
    snapshot.turn_ref === "" && snapshot.events.length > 0
      ? await loadEncryptedSessionHistory({
          ...options,
          beforeId: 0,
          limit: 100,
        })
      : undefined;
  return {
    messages:
      legacy?.messages.filter((message) => replayTurns.has(message.turn_id)) ??
      [],
    replayEvents: events,
    headCursor: snapshot.head_cursor,
    turnRef: snapshot.turn_ref,
    pagination: {
      has_more: snapshot.has_older,
      next_before_id: snapshot.turn_start_cursor,
    },
  };
}

function validateReplayPage(
  page: ReplayResponse,
  first: ReplayResponse | undefined,
  after: number,
) {
  for (const value of [
    page.head_cursor,
    page.turn_start_cursor,
    page.next_after_cursor,
  ])
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error("Invalid encrypted replay cursor");
  if (
    first &&
    (page.head_cursor !== first.head_cursor ||
      page.turn_ref !== first.turn_ref ||
      page.turn_start_cursor !== first.turn_start_cursor)
  )
    throw new Error("Encrypted replay snapshot changed");
  let cursor = after;
  for (const event of page.events) {
    if (
      !Number.isSafeInteger(event.cursor) ||
      event.cursor <= cursor ||
      event.cursor > page.head_cursor
    )
      throw new Error("Encrypted replay cursor did not advance");
    cursor = event.cursor;
  }
  if (page.next_after_cursor !== cursor || (page.has_more && cursor <= after))
    throw new Error("Encrypted replay cursor did not advance");
}

export function normalizeReplayFrame(
  frame: unknown,
  sessionId: string,
  context: EncryptedEventContext,
  createdAt: string,
): SessionEvent[] {
  if (
    frame &&
    typeof frame === "object" &&
    "method" in frame &&
    frame.method === "session/prompt"
  ) {
    const prompt = frame as {
      id?: string | number;
      params?: {
        prompt?: { type: string; text?: string }[];
        paxEncryptedAttachments?: EncryptedAttachment[];
      };
    };
    const text = (prompt.params?.prompt ?? [])
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("");
    if (prompt.params?.paxEncryptedAttachments?.length) {
      return [
        {
          type: "user_message",
          id: `${sessionId}:user:${prompt.id}`,
          sessionId,
          turnId: context.turnId,
          content: text,
          createdAt,
          attachments: prompt.params.paxEncryptedAttachments.map(
            (attachment) => ({
              attachmentId: attachment.attachment_id,
              filename: attachment.filename,
              contentType: attachment.content_type,
              sizeBytes: attachment.size_bytes,
            }),
          ),
        },
      ];
    }
    return normalizeHistoryMessage({
      message_id: `${sessionId}:user:${prompt.id}`,
      session_id: sessionId,
      turn_id: context.turnId,
      role: "user",
      message_type: "user_message",
      created_at: createdAt,
      raw_json: frame as Record<string, unknown>,
      parts: [{ part_index: 0, part_type: "text", text }],
    });
  }
  return normalizeTunnelFrame(frame, {
    createdAt,
    streamId: `e2ee:${sessionId}:${context.turnId ?? "legacy"}`,
  }).map(
    (event) =>
      ({
        ...event,
        sessionId,
        ...(context.turnId ? { turnId: context.turnId } : {}),
      }) as SessionEvent,
  );
}

export function replayHistoryEvents(pages: EncryptedReplayPage[] | undefined) {
  return (pages ?? [])
    .toReversed()
    .flatMap((page) =>
      page.messages.length
        ? reconcileEncryptedTimeline(
            normalizeEncryptedHistory(page.messages),
            page.replayEvents,
          ).timeline
        : page.replayEvents,
    );
}
