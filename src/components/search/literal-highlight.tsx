import { Fragment } from "react";

// Treat every character as text, including HTML and regular expression syntax.
export function LiteralHighlight({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  if (!query) return text;
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
  const needle = query.toLowerCase();
  const spans = [];
  let offset = 0;
  let index = folded.indexOf(needle);
  while (index !== -1) {
    const start = boundaries[index].start;
    const end = boundaries[index + needle.length - 1].end;
    spans.push(
      <Fragment key={offset}>
        {text.slice(offset, start)}
        <mark className="rounded-sm bg-accent/20 text-ink">
          {text.slice(start, end)}
        </mark>
      </Fragment>,
    );
    offset = end;
    index = folded.indexOf(needle, index + needle.length);
  }
  return (
    <>
      {spans}
      {text.slice(offset)}
    </>
  );
}
