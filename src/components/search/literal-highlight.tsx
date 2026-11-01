import { Fragment } from "react";

// Treat every character as text, including HTML and regular expression syntax.
export function LiteralHighlight({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const needles = [
    ...new Set(
      query
        .split(/\p{White_Space}+/u)
        .filter(Boolean)
        .map((term) =>
          Array.from(term, (character) => character.toLowerCase()).join(""),
        ),
    ),
  ].sort((left, right) => right.length - left.length);
  if (!needles.length) return text;
  // Lowercasing can change UTF-16 length (for example, İ → i + dot).
  // Keep original boundaries so highlights never remove or duplicate text.
  let folded = "";
  const boundaries: { start: number; end: number }[] = [];
  let originalOffset = 0;
  for (const character of text) {
    const lower = character.toLowerCase();
    for (let index = 0; index < lower.length; index++) {
      boundaries.push({
        start: originalOffset,
        end: originalOffset + character.length,
      });
    }
    folded += lower;
    originalOffset += character.length;
  }
  const matches: { start: number; end: number }[] = [];
  for (const needle of needles) {
    let index = folded.indexOf(needle);
    while (index !== -1) {
      matches.push({
        start: boundaries[index].start,
        end: boundaries[index + needle.length - 1].end,
      });
      index = folded.indexOf(needle, index + 1);
    }
  }
  // Union overlapping literal matches, including repeated occurrences inside
  // one lowercase expansion. Render original slices once, without nested marks.
  matches.sort(
    (left, right) => left.start - right.start || right.end - left.end,
  );
  const ranges: { start: number; end: number }[] = [];
  for (const match of matches) {
    const previous = ranges.at(-1);
    if (previous && match.start < previous.end)
      previous.end = Math.max(previous.end, match.end);
    else ranges.push({ ...match });
  }
  const spans = [];
  let offset = 0;
  for (const { start, end } of ranges) {
    spans.push(
      <Fragment key={offset}>
        {text.slice(offset, start)}
        <mark className="rounded-sm bg-accent/20 text-ink">
          {text.slice(start, end)}
        </mark>
      </Fragment>,
    );
    offset = end;
  }
  return (
    <>
      {spans}
      {text.slice(offset)}
    </>
  );
}
