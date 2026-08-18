export const ARTIFACT_PREVIEW_BUDGET = Object.freeze({
  maxBytes: 1_000_000,
  maxBlobBytes: 25 * 1024 * 1024,
  maxTextLines: 5_000,
  maxJsonlRecords: 500,
  maxCsvRows: 1_000,
  maxCsvColumns: 100,
});

export class ArtifactPreviewTooLargeError extends Error {
  constructor(maxBytes = ARTIFACT_PREVIEW_BUDGET.maxBlobBytes) {
    super(
      `This artifact is too large to preview safely (limit ${formatBytes(maxBytes)}). Download it instead.`,
    );
    this.name = "ArtifactPreviewTooLargeError";
  }
}

export type ArtifactPreviewText = {
  content: string;
  truncated: boolean;
  truncationReason?: string;
};

export async function readArtifactPreviewText(
  url: string,
  maxBytes = ARTIFACT_PREVIEW_BUDGET.maxBytes,
): Promise<ArtifactPreviewText> {
  const response = await fetchArtifactPreview(url);

  try {
    if (!response.body) {
      return limitText(await response.text(), maxBytes);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let byteCount = 0;
    let content = "";
    let truncated = false;

    try {
      while (byteCount < maxBytes) {
        const { done, value } = await reader.read();
        if (done) {
          content += decoder.decode();
          break;
        }

        const remaining = maxBytes - byteCount;
        if (value.byteLength > remaining) {
          content += decoder.decode(value.subarray(0, remaining), {
            stream: true,
          });
          truncated = true;
          await reader.cancel();
          break;
        }

        byteCount += value.byteLength;
        content += decoder.decode(value, { stream: true });
      }
    } finally {
      releasePreviewReader(reader);
    }

    const lineLimited = limitLines(
      content,
      ARTIFACT_PREVIEW_BUDGET.maxTextLines,
    );
    return {
      content: lineLimited.content,
      truncated: truncated || lineLimited.truncated,
      truncationReason: truncated
        ? `Preview limited to ${formatBytes(maxBytes)}.`
        : lineLimited.truncationReason,
    };
  } catch {
    throw new Error("Preview response could not be read");
  }
}

export async function readArtifactPreviewBlob(
  url: string,
  maxBytes = ARTIFACT_PREVIEW_BUDGET.maxBlobBytes,
  fallbackContentType?: string,
): Promise<Blob> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError("Preview size limit is invalid");
  }

  const response = await fetchArtifactPreview(url);
  const declaredLength = parseContentLength(
    response.headers.get("content-length"),
  );
  if (declaredLength !== undefined && declaredLength > maxBytes) {
    await cancelPreviewBody(response.body);
    throw new ArtifactPreviewTooLargeError(maxBytes);
  }

  const contentType =
    response.headers.get("content-type") ?? fallbackContentType ?? "";
  if (!response.body) {
    return new Blob([], { type: contentType });
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    throw new Error("Preview response could not be read");
  }
  const chunks: ArrayBuffer[] = [];
  let byteCount = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (byteCount + value.byteLength > maxBytes) {
        await cancelPreviewBody(reader);
        throw new ArtifactPreviewTooLargeError(maxBytes);
      }
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk.buffer);
      byteCount += value.byteLength;
    }

    const blob = new Blob(chunks, { type: contentType });
    if (blob.size > maxBytes) {
      throw new ArtifactPreviewTooLargeError(maxBytes);
    }
    return blob;
  } catch (caught) {
    if (caught instanceof ArtifactPreviewTooLargeError) {
      throw caught;
    }
    throw new Error("Preview response could not be read");
  } finally {
    releasePreviewReader(reader);
  }
}

export function parseCsvPreview(
  content: string,
  maxRows = ARTIFACT_PREVIEW_BUDGET.maxCsvRows,
  maxColumns = ARTIFACT_PREVIEW_BUDGET.maxCsvColumns,
) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let truncated = false;

  const pushCell = () => {
    if (row.length < maxColumns) {
      row.push(cell);
    } else {
      truncated = true;
    }
    cell = "";
  };

  const pushRow = () => {
    pushCell();
    if (rows.length < maxRows + 1) {
      rows.push(row);
    } else {
      truncated = true;
    }
    row = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      pushCell();
    } else if (character === "\n") {
      pushRow();
      if (rows.length > maxRows) {
        truncated = index < content.length - 1;
        break;
      }
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    pushRow();
  }

  return {
    header: rows[0] ?? [],
    rows: rows.slice(1, maxRows + 1),
    truncated,
  };
}

export function parseJsonlPreview(
  content: string,
  maxRecords = ARTIFACT_PREVIEW_BUDGET.maxJsonlRecords,
) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return {
    records: lines.slice(0, maxRecords).map((line) => {
      try {
        return { content: JSON.stringify(JSON.parse(line), null, 2) };
      } catch {
        return { content: line, invalid: true };
      }
    }),
    truncated: lines.length > maxRecords,
  };
}

function limitText(content: string, maxBytes: number): ArtifactPreviewText {
  const encoded = new TextEncoder().encode(content);
  const byteLimited =
    encoded.byteLength > maxBytes
      ? new TextDecoder().decode(encoded.subarray(0, maxBytes))
      : content;
  const lineLimited = limitLines(
    byteLimited,
    ARTIFACT_PREVIEW_BUDGET.maxTextLines,
  );
  const byteTruncated = encoded.byteLength > maxBytes;

  return {
    content: lineLimited.content,
    truncated: byteTruncated || lineLimited.truncated,
    truncationReason: byteTruncated
      ? `Preview limited to ${formatBytes(maxBytes)}.`
      : lineLimited.truncationReason,
  };
}

async function fetchArtifactPreview(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new Error("Preview request failed");
  }

  if (!response.ok) {
    throw new Error(`Preview fetch failed with ${response.status}`);
  }
  return response;
}

async function cancelPreviewBody(
  body:
    | ReadableStream<Uint8Array>
    | ReadableStreamDefaultReader<Uint8Array>
    | null,
) {
  try {
    await body?.cancel();
  } catch {
    // Cancellation is best-effort; the caller's stable error takes precedence.
  }
}

function releasePreviewReader(reader: ReadableStreamDefaultReader<Uint8Array>) {
  try {
    reader.releaseLock();
  } catch {
    // Release is best-effort and must not expose implementation error details.
  }
}

function parseContentLength(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function limitLines(content: string, maxLines: number): ArtifactPreviewText {
  const lines = content.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return { content, truncated: false };
  }
  return {
    content: lines.slice(0, maxLines).join("\n"),
    truncated: true,
    truncationReason: `Preview limited to ${maxLines.toLocaleString()} lines.`,
  };
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
