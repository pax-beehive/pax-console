import { createTwoFilesPatch } from "diff";
import { CodePatch } from "./code-patch-contract";

export function codePatchToText(patch: CodePatch) {
  if (patch.diffText) {
    return patch.diffText;
  }

  const title = patch.path ?? "artifact";
  if (patch.operation === "delete" && patch.oldText === undefined) {
    return `--- ${title}\n+++ /dev/null\n@@\nDeleted file content unavailable`;
  }

  if (patch.oldText !== undefined && patch.newText !== undefined) {
    return simpleUnifiedDiff(title, patch.oldText, patch.newText);
  }

  if (patch.newText !== undefined) {
    return `+++ ${title}\n${prefixLines(patch.newText, "+")}`;
  }

  if (patch.oldText !== undefined) {
    return `--- ${title}\n${prefixLines(patch.oldText, "-")}`;
  }

  return "";
}

export function codePatchStats(patch: CodePatch) {
  return diffStats(codePatchToText(patch));
}

export function codePatchGroupStats(patches: CodePatch[]) {
  const netPatch = chainedNetPatch(patches);
  if (netPatch) {
    return codePatchStats(netPatch);
  }

  return patches.reduce(
    (total, patch) => {
      const stats = codePatchStats(patch);
      return {
        added: total.added + stats.added,
        removed: total.removed + stats.removed,
      };
    },
    { added: 0, removed: 0 },
  );
}

function chainedNetPatch(patches: CodePatch[]): CodePatch | undefined {
  if (
    patches.length === 0 ||
    patches.some(
      (patch) => patch.oldText === undefined || patch.newText === undefined,
    )
  ) {
    return undefined;
  }

  for (let index = 1; index < patches.length; index += 1) {
    if (patches[index - 1].newText !== patches[index].oldText) {
      return undefined;
    }
  }

  return {
    operation: "patch",
    path: patches[0].path,
    oldText: patches[0].oldText,
    newText: patches.at(-1)?.newText,
  };
}

function diffStats(diffText: string) {
  return diffText.split("\n").reduce(
    (stats, line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        stats.added += 1;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        stats.removed += 1;
      }
      return stats;
    },
    { added: 0, removed: 0 },
  );
}

function simpleUnifiedDiff(path: string, oldText: string, newText: string) {
  return createTwoFilesPatch(path, path, oldText, newText, "", "", {
    context: 3,
  }).trimEnd();
}

function splitLines(value: string) {
  return value.replace(/\n$/, "").split("\n");
}

function prefixLines(value: string, prefix: string) {
  return splitLines(value)
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
