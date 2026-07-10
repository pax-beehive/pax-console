export type CodePatchSource = "input" | "output" | "permission";

export type CodePatch = {
  path?: string;
  oldText?: string;
  newText?: string;
  diffText?: string;
  operation: "delete" | "diff" | "patch" | "write";
  source?: CodePatchSource;
};

export type RawCodePatch = Omit<CodePatch, "operation"> & {
  metaKind?: string;
  operation?: CodePatch["operation"];
};

export function normalizeCodePatch(raw: RawCodePatch): CodePatch | undefined {
  const metaKind = raw.metaKind?.toLowerCase();
  const addedFile =
    metaKind === "add" && raw.oldText === "" && raw.newText !== undefined;
  const operation =
    raw.operation ??
    (raw.diffText !== undefined
      ? "diff"
      : raw.oldText !== undefined && raw.newText !== undefined && !addedFile
        ? "patch"
        : raw.newText !== undefined || raw.oldText !== undefined || addedFile
          ? "write"
          : undefined);

  if (!operation) {
    return undefined;
  }

  return {
    operation,
    ...(raw.path !== undefined ? { path: raw.path } : {}),
    ...(raw.source !== undefined ? { source: raw.source } : {}),
    ...(raw.diffText !== undefined ? { diffText: raw.diffText } : {}),
    ...(addedFile || raw.oldText === undefined ? {} : { oldText: raw.oldText }),
    ...(raw.newText !== undefined ? { newText: raw.newText } : {}),
  };
}

export function coalesceCodePatches(patches: CodePatch[]) {
  const byKey = new Map<string, CodePatch>();
  for (const patch of patches) {
    const key = patch.path ?? codePatchSignature(patch);
    const existing = byKey.get(key);
    if (!existing || codePatchPriority(patch) >= codePatchPriority(existing)) {
      byKey.set(key, patch);
    }
  }
  return [...byKey.values()];
}

export function codePatchSignature(patch: CodePatch) {
  return [
    patch.operation,
    patch.path ?? "",
    patch.oldText ?? "",
    patch.newText ?? "",
    patch.diffText ?? "",
  ].join("\u0000");
}

function codePatchPriority(patch: CodePatch) {
  const sourceScore = patch.source === "permission" ? 0 : 100;
  if (patch.operation === "delete") {
    return sourceScore + 90;
  }
  if (
    patch.source === "permission" &&
    patch.operation === "write" &&
    patch.oldText === undefined &&
    patch.newText !== undefined
  ) {
    return 90;
  }
  if (patch.diffText) {
    return sourceScore + 80;
  }
  if (patch.oldText !== undefined && patch.newText !== undefined) {
    return sourceScore + 70;
  }
  if (patch.newText !== undefined || patch.oldText !== undefined) {
    return sourceScore + 60;
  }
  return sourceScore;
}
