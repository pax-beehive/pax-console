const sessionDeckStoragePrefix = "pax-console:session-deck";
const maxSessionDeckSize = 24;

export function sessionDeckStorageKey(userId: string) {
  return `${sessionDeckStoragePrefix}:${userId}`;
}

export function readSessionDeck(storage: Storage, userId: string) {
  try {
    const parsed = JSON.parse(
      storage.getItem(sessionDeckStorageKey(userId)) ?? "[]",
    );
    if (!Array.isArray(parsed)) {
      return [];
    }

    return normalizeSessionDeck(
      parsed.filter((value) => typeof value === "string"),
    );
  } catch {
    return [];
  }
}

export function writeSessionDeck(
  storage: Storage,
  userId: string,
  sessionIds: string[],
) {
  storage.setItem(
    sessionDeckStorageKey(userId),
    JSON.stringify(normalizeSessionDeck(sessionIds)),
  );
}

export function rememberSessionInDeck(sessionIds: string[], sessionId: string) {
  const normalizedSessionId = sessionId.trim();
  if (!normalizedSessionId || normalizedSessionId === "new") {
    return normalizeSessionDeck(sessionIds);
  }
  if (sessionIds.includes(normalizedSessionId)) {
    return normalizeSessionDeck(sessionIds);
  }

  return normalizeSessionDeck([...sessionIds, normalizedSessionId]);
}

export function dismissSessionFromDeck(
  sessionIds: string[],
  sessionId: string,
) {
  return normalizeSessionDeck(sessionIds.filter((id) => id !== sessionId));
}

export function restoreSessionToDeck(
  sessionIds: string[],
  sessionId: string,
  index: number,
) {
  const withoutSession = sessionIds.filter((id) => id !== sessionId);
  const insertionIndex = Math.max(0, Math.min(index, withoutSession.length));
  return normalizeSessionDeck([
    ...withoutSession.slice(0, insertionIndex),
    sessionId,
    ...withoutSession.slice(insertionIndex),
  ]);
}

export function reorderSessionDeck(
  sessionIds: string[],
  reorderedSessionIds: string[],
) {
  const current = normalizeSessionDeck(sessionIds);
  const currentIds = new Set(current);
  const reordered = normalizeSessionDeck(reorderedSessionIds).filter((id) =>
    currentIds.has(id),
  );
  const reorderedIds = new Set(reordered);

  return [...reordered, ...current.filter((id) => !reorderedIds.has(id))];
}

function normalizeSessionDeck(sessionIds: string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const sessionId of sessionIds) {
    const trimmed = sessionId.trim();
    if (!trimmed || trimmed === "new" || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized.slice(-maxSessionDeckSize);
}
