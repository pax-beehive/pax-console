import {
  CodePatch,
  CodePatchSource,
  codePatchSignature,
  normalizeCodePatch,
  RawCodePatch,
} from "./code-patch-contract";

const oldTextKeys = [
  "old_string",
  "oldText",
  "old_text",
  "oldContent",
  "old_content",
];
const newTextKeys = [
  "new_string",
  "newText",
  "new_text",
  "newContent",
  "new_content",
];
const pathKeys = [
  "path",
  "file_path",
  "filePath",
  "full_path",
  "fullPath",
  "filename",
];
const nestedKeys = [
  "arguments",
  "args",
  "input",
  "output",
  "result",
  "request",
  "rawInput",
  "raw_input",
  "params",
  "toolCall",
  "tool_call",
  "content",
  "data",
  "event",
  "update",
  "files",
  "attachments",
];

export function extractCodePatches(value: unknown, source?: CodePatchSource) {
  return extractCodePatchesWithOptions(value, source);
}

export function extractCodePatchesWithOptions(
  value: unknown,
  source?: CodePatchSource,
  options: { includeStringDiffs?: boolean } = {},
) {
  const patches: CodePatch[] = [];
  const seen = new Set<string>();
  collectCodePatches(
    value,
    source,
    patches,
    seen,
    0,
    options.includeStringDiffs ?? true,
  );
  return patches;
}

function collectCodePatches(
  value: unknown,
  source: CodePatchSource | undefined,
  patches: CodePatch[],
  seen: Set<string>,
  depth: number,
  includeStringDiffs: boolean,
) {
  if (value === undefined || value === null || depth > 8) {
    return;
  }

  if (typeof value === "string") {
    collectStringPatches(
      value,
      source,
      patches,
      seen,
      depth,
      includeStringDiffs,
    );
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCodePatches(
        item,
        source,
        patches,
        seen,
        depth + 1,
        includeStringDiffs,
      );
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  const record = value as Record<string, unknown>;
  for (const rawPatch of rawPatchesFromRecord(record, source)) {
    pushPatch(patches, seen, rawPatch);
  }

  for (const key of nestedKeys) {
    collectCodePatches(
      record[key],
      source,
      patches,
      seen,
      depth + 1,
      includeStringDiffs,
    );
  }
}

function collectStringPatches(
  value: string,
  source: CodePatchSource | undefined,
  patches: CodePatch[],
  seen: Set<string>,
  depth: number,
  includeStringDiffs: boolean,
) {
  const parsed = parseJSONLike(value);
  if (parsed !== undefined) {
    collectCodePatches(
      parsed,
      source,
      patches,
      seen,
      depth + 1,
      includeStringDiffs,
    );
    return;
  }
  if (includeStringDiffs && looksLikeDiff(value)) {
    pushPatch(patches, seen, { diffText: value, operation: "diff", source });
  }
}

function rawPatchesFromRecord(
  record: Record<string, unknown>,
  source: CodePatchSource | undefined,
): RawCodePatch[] {
  return [
    ...rawStructuredEditPatches(record, source),
    ...rawWriteFileToolPatches(record, source),
    ...rawTerminalDeletePatches(record, source),
  ];
}

function rawStructuredEditPatches(
  record: Record<string, unknown>,
  source: CodePatchSource | undefined,
): RawCodePatch[] {
  const path = stringFromKeys(record, pathKeys);
  const oldText = stringFromKeys(record, oldTextKeys);
  const newText = stringFromKeys(record, newTextKeys);
  const diffText = stringFromKeys(record, [
    "diff",
    "patch",
    "unified_diff",
    "unifiedDiff",
  ]);
  const type = stringValue(record, "type")?.toLowerCase();
  const metaKind = stringValue(asRecord(record._meta), "kind");
  const patches: RawCodePatch[] = [];

  if (diffText && looksLikeDiff(diffText)) {
    patches.push({
      diffText,
      operation: "diff",
      path,
      source,
    });
  }

  const typedDiffText =
    type === "diff" && newText !== undefined && looksLikeDiff(newText)
      ? newText
      : undefined;
  if (typedDiffText) {
    patches.push({
      diffText: typedDiffText,
      operation: "diff",
      path,
      source,
    });
  } else if (oldText !== undefined || newText !== undefined) {
    patches.push({
      metaKind,
      newText,
      oldText,
      path,
      source,
    });
  }

  return patches;
}

function rawWriteFileToolPatches(
  record: Record<string, unknown>,
  source: CodePatchSource | undefined,
): RawCodePatch[] {
  const tool = stringValue(record, "tool")?.toLowerCase();
  const operation = stringValue(record, "operation")?.toLowerCase();
  const argumentsRecord = asRecord(record.arguments) ?? asRecord(record.args);
  const content = stringValue(argumentsRecord ?? record, "content");
  if (
    content === undefined ||
    (tool !== "write_file" &&
      operation !== "write" &&
      stringValue(record, "name") !== "write_file")
  ) {
    return [];
  }

  return [
    {
      newText: content,
      operation: "write",
      path:
        stringFromKeys(argumentsRecord ?? {}, pathKeys) ??
        stringFromKeys(record, pathKeys),
      source,
    },
  ];
}

function rawTerminalDeletePatches(
  record: Record<string, unknown>,
  source: CodePatchSource | undefined,
): RawCodePatch[] {
  const contentPaths = inferTerminalDeletePaths(
    textFromPayload(record.content),
  );
  const title = stringValue(record, "title");
  const terminalDeletePaths =
    contentPaths.length > 0
      ? contentPaths
      : isTruncatedTerminalTitle(title)
        ? []
        : inferTerminalDeletePaths(title);
  return terminalDeletePaths.map((path) => ({
    operation: "delete",
    path,
    source,
  }));
}

function isTruncatedTerminalTitle(title: string | undefined) {
  return title !== undefined && /(?:\.\.\.|…)$/.test(title.trimEnd());
}

function pushPatch(
  patches: CodePatch[],
  seen: Set<string>,
  rawPatch: RawCodePatch,
) {
  const patch = normalizeCodePatch(rawPatch);
  if (!patch) {
    return;
  }

  const signature = codePatchSignature(patch);
  if (seen.has(signature)) {
    return;
  }
  seen.add(signature);
  patches.push(patch);
}

function parseJSONLike(value: string) {
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

function looksLikeDiff(value: string) {
  return /(^diff --git |^--- .*\n\+\+\+ |^@@ |\n@@ )/m.test(value);
}

function inferTerminalDeletePaths(...values: (string | undefined)[]) {
  for (const value of values) {
    const command = value?.trim();
    if (!command) {
      continue;
    }

    const match =
      /^terminal:\s*rm\s+(.+?)\s*$/.exec(command) ??
      /^\$?\s*rm\s+(.+?)\s*$/.exec(command);
    if (!match) {
      continue;
    }

    const words = splitShellWords(match[1]);
    if (!words) {
      continue;
    }

    const separator = words.indexOf("--");
    const paths = (separator >= 0 ? words.slice(separator + 1) : words).filter(
      (word) => word && (separator >= 0 || !word.startsWith("-")),
    );
    if (paths.length > 0) {
      return paths;
    }
  }
  return [];
}

function splitShellWords(value: string) {
  const words: string[] = [];
  let word = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const character of value) {
    if (escaping) {
      word += character;
      escaping = false;
    } else if (character === "\\" && quote !== "'") {
      escaping = true;
    } else if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        word += character;
      }
    } else if (character === "'" || character === '"') {
      quote = character;
    } else if (/\s/.test(character)) {
      if (word) {
        words.push(word);
        word = "";
      }
    } else {
      word += character;
    }
  }

  if (quote || escaping) {
    return undefined;
  }
  if (word) {
    words.push(word);
  }
  return words;
}

function textFromPayload(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    const text = value.map(textFromPayload).filter(Boolean).join("\n");
    return text || undefined;
  }

  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["text", "content", "message", "output"]) {
    const text = textFromPayload(record[key]);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function stringFromKeys(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = stringValue(record, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function stringValue(record: Record<string, unknown> | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

function asRecord(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
