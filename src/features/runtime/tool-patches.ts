export {
  type CodePatch,
  type CodePatchSource,
  coalesceCodePatches,
} from "./code-patch-contract";
export {
  extractCodePatches,
  extractCodePatchesWithOptions,
} from "./code-patch-adapters";
export {
  codePatchGroupStats,
  codePatchStats,
  codePatchToText,
} from "./code-patch-render";

export function toolCallMayEditFiles(name: string) {
  return /\b(apply[_ -]?patch|write(?:[_ -]?file)?|patch|edit|delete|remove|unlink|move|rename)\b/i.test(
    name,
  );
}
