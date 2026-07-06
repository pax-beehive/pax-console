type CodeFence = {
  marker: string;
};

const fenceOpenPattern = /^( {0,3})(`{3,}|~{3,})(.*)$/;

export function normalizeStreamingMarkdown(content: string) {
  const analysis = analyzeStreamingMarkdown(content);

  if (analysis.openFence) {
    const prefix = content.endsWith("\n") || content.endsWith("\r") ? "" : "\n";
    return `${content}${prefix}${analysis.openFence.marker}`;
  }

  if (analysis.openInlineCodeRunLength > 0) {
    return `${content}${"`".repeat(analysis.openInlineCodeRunLength)}`;
  }

  return content;
}

function analyzeStreamingMarkdown(content: string) {
  let openFence: CodeFence | undefined;
  let outsideFenceContent = "";
  let index = 0;

  while (index < content.length) {
    const nextLineStart = readLine(content, index);
    const line = nextLineStart.line.replace(/\r?\n$/, "");

    if (openFence) {
      if (isFenceClose(line, openFence.marker)) {
        openFence = undefined;
      }
    } else {
      const openingMarker = parseFenceOpen(line);
      if (openingMarker) {
        openFence = { marker: openingMarker };
      } else {
        outsideFenceContent += nextLineStart.line;
      }
    }

    index = nextLineStart.nextIndex;
  }

  return {
    openFence,
    openInlineCodeRunLength: openFence
      ? 0
      : findOpenInlineCodeRunLength(outsideFenceContent),
  };
}

function readLine(content: string, startIndex: number) {
  const newlineIndex = content.indexOf("\n", startIndex);

  if (newlineIndex === -1) {
    return {
      line: content.slice(startIndex),
      nextIndex: content.length,
    };
  }

  return {
    line: content.slice(startIndex, newlineIndex + 1),
    nextIndex: newlineIndex + 1,
  };
}

function parseFenceOpen(line: string) {
  const match = line.match(fenceOpenPattern);

  if (!match) {
    return undefined;
  }

  const marker = match[2];
  const info = match[3] ?? "";

  if (marker.startsWith("`") && info.includes("`")) {
    return undefined;
  }

  return marker;
}

function isFenceClose(line: string, openingMarker: string) {
  const fenceChar = openingMarker[0];
  const escapedFenceChar = fenceChar === "`" ? "`" : "\\~";
  const closingPattern = new RegExp(
    `^ {0,3}${escapedFenceChar}{${openingMarker.length},}[ \\t]*$`,
  );

  return closingPattern.test(line);
}

function findOpenInlineCodeRunLength(content: string) {
  let openRunLength = 0;
  let index = 0;

  while (index < content.length) {
    if (content[index] !== "`" || isEscaped(content, index)) {
      index += 1;
      continue;
    }

    const runLength = countBacktickRun(content, index);

    if (openRunLength === 0) {
      openRunLength = runLength;
    } else if (runLength === openRunLength) {
      openRunLength = 0;
    }

    index += runLength;
  }

  return openRunLength;
}

function countBacktickRun(content: string, startIndex: number) {
  let index = startIndex;

  while (content[index] === "`") {
    index += 1;
  }

  return index - startIndex;
}

function isEscaped(content: string, index: number) {
  let slashCount = 0;
  let cursor = index - 1;

  while (cursor >= 0 && content[cursor] === "\\") {
    slashCount += 1;
    cursor -= 1;
  }

  return slashCount % 2 === 1;
}
