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

function simpleUnifiedDiff(path: string, oldText: string, newText: string) {
  if (oldText === newText) {
    return `--- ${path}\n+++ ${path}\n`;
  }
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  return [
    `--- ${path}`,
    `+++ ${path}`,
    "@@",
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join("\n");
}

function splitLines(value: string) {
  return value.replace(/\n$/, "").split("\n");
}

function prefixLines(value: string, prefix: string) {
  return splitLines(value)
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
