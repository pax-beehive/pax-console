/** Draft text around the caret when dictation started. */
export type DictationAnchor = {
  before: string;
  after: string;
};

export function dictationAnchor(
  draft: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
): DictationAnchor {
  const start = clampIndex(selectionStart ?? draft.length, draft.length);
  const end = clampIndex(selectionEnd ?? start, draft.length);
  return {
    before: draft.slice(0, Math.min(start, end)),
    after: draft.slice(Math.max(start, end)),
  };
}

function clampIndex(value: number, length: number) {
  return Math.max(0, Math.min(length, value));
}

/**
 * Places spoken text at the anchor, replacing any selection. Returns the new
 * draft and the caret position right after the spoken text.
 */
export function composeDictation(anchor: DictationAnchor, spoken: string) {
  if (!spoken) {
    return {
      text: anchor.before + anchor.after,
      caret: anchor.before.length,
    };
  }
  const lead = needsSpace(anchor.before.at(-1), spoken[0]) ? " " : "";
  const tail = needsSpace(spoken.at(-1), anchor.after[0]) ? " " : "";
  const text = anchor.before + lead + spoken + tail + anchor.after;
  return { text, caret: (anchor.before + lead + spoken).length };
}

/**
 * Mirrors the manager's transcript joining: a space only separates two Latin
 * words, Chinese text is joined directly.
 */
export function joinTranscript(final: string, partial: string) {
  if (!final) return partial;
  if (!partial) return final;
  return needsSpace(final.at(-1), partial[0])
    ? `${final} ${partial}`
    : final + partial;
}

function needsSpace(last: string | undefined, first: string | undefined) {
  if (!last || !first) return false;
  if (!/^[A-Za-z0-9]$/.test(first)) return false;
  return /^[A-Za-z0-9.,!?;:]$/.test(last);
}
