import { describe, expect, it } from "vitest";
import {
  coalesceCodePatches,
  codePatchGroupStats,
  codePatchStats,
  codePatchToText,
  extractCodePatches,
  extractCodePatchesWithOptions,
} from "./tool-patches";

describe("tool patches", () => {
  it("computes a line-level unified diff from old and new contents", () => {
    const text = codePatchToText({
      operation: "patch",
      path: "/tmp/weather.ts",
      oldText: "const city = 'Paris';\nconst units = 'c';\n",
      newText: "const city = 'Tokyo';\nconst units = 'c';\n",
    });

    expect(text).toContain("@@ -1,2 +1,2 @@");
    expect(text).toContain("-const city = 'Paris';");
    expect(text).toContain("+const city = 'Tokyo';");
    expect(text).toContain(" const units = 'c';");
    expect(text).not.toContain("-const units = 'c';");
    expect(text).not.toContain("+const units = 'c';");
  });

  it("can ignore unstructured git diff command output", () => {
    const diff =
      "diff --git a/weather.ts b/weather.ts\n--- a/weather.ts\n+++ b/weather.ts\n@@ -1 +1 @@\n-old\n+new";

    expect(
      extractCodePatchesWithOptions(diff, "output", {
        includeStringDiffs: false,
      }),
    ).toEqual([]);
    expect(extractCodePatches(diff, "output")).toHaveLength(1);
  });

  it("drops old and new contents that are identical", () => {
    expect(
      extractCodePatches(
        {
          path: "/tmp/weather.ts",
          oldText: "const city = 'Paris';\n",
          newText: "const city = 'Paris';\n",
        },
        "output",
      ),
    ).toEqual([]);
  });

  it("uses the computed diff for old and new content stats", () => {
    expect(
      codePatchStats({
        operation: "patch",
        path: "/tmp/weather.ts",
        oldText: "const city = 'Paris';\nconst units = 'c';\n",
        newText: "const city = 'Tokyo';\nconst units = 'c';\n",
      }),
    ).toEqual({ added: 1, removed: 1 });
  });

  it("computes net stats for chained edits to the same file", () => {
    expect(
      codePatchGroupStats([
        {
          operation: "patch",
          path: "/tmp/weather.ts",
          oldText: "const city = 'Paris';\n",
          newText: "const city = 'Tokyo';\n",
        },
        {
          operation: "patch",
          path: "/tmp/weather.ts",
          oldText: "const city = 'Tokyo';\n",
          newText: "const city = 'Paris';\n",
        },
      ]),
    ).toEqual({ added: 0, removed: 0 });
  });

  it("sums stats when multiple edits cannot be safely chained", () => {
    expect(
      codePatchGroupStats([
        {
          operation: "patch",
          path: "/tmp/weather.ts",
          oldText: "Paris",
          newText: "Tokyo",
        },
        {
          operation: "patch",
          path: "/tmp/weather.ts",
          oldText: "celsius",
          newText: "fahrenheit",
        },
      ]),
    ).toEqual({ added: 2, removed: 2 });
  });

  it("extracts Hermes write_file permission payloads as content-only writes", () => {
    const patches = extractCodePatches(
      {
        arguments: {
          content: "#!/bin/bash\necho weather\n",
          path: "/tmp/weather.sh",
        },
        tool: "write_file",
      },
      "permission",
    );

    expect(patches).toMatchObject([
      {
        operation: "write",
        path: "/tmp/weather.sh",
        newText: "#!/bin/bash\necho weather\n",
        source: "permission",
      },
    ]);
    expect(patches[0]).not.toHaveProperty("oldText");
    expect(codePatchToText(patches[0])).toBe(
      "+++ /tmp/weather.sh\n+#!/bin/bash\n+echo weather",
    );
  });

  it("extracts Gemini permission diff add blocks as content-only writes", () => {
    const patches = extractCodePatches(
      {
        content: [
          {
            _meta: { kind: "add" },
            newText: "#!/usr/bin/env python3\nprint('weather')\n",
            oldText: "",
            path: "/private/tmp/weather.py",
            type: "diff",
          },
        ],
        kind: "edit",
        title: "Writing to ../private/tmp/weather.py",
        toolCallId: "write_file__ujao7t88",
      },
      "permission",
    );

    expect(patches).toMatchObject([
      {
        operation: "write",
        path: "/private/tmp/weather.py",
        newText: "#!/usr/bin/env python3\nprint('weather')\n",
        source: "permission",
      },
    ]);
    expect(patches[0]).not.toHaveProperty("oldText");
  });

  it("keeps one patch per file and prefers a content-only permission write over stale permission diffs", () => {
    const patches = coalesceCodePatches([
      {
        operation: "patch",
        path: "/tmp/weather.sh",
        oldText: "old\n",
        newText: "new\n",
        source: "permission",
      },
      {
        operation: "write",
        path: "/tmp/weather.sh",
        newText: "#!/bin/bash\necho weather\n",
        source: "permission",
      },
    ]);

    expect(patches).toMatchObject([
      {
        operation: "write",
        path: "/tmp/weather.sh",
        newText: "#!/bin/bash\necho weather\n",
      },
    ]);
    expect(patches[0]).not.toHaveProperty("oldText");
  });

  it("extracts terminal rm commands as delete patches", () => {
    const patches = extractCodePatches(
      {
        content: [
          {
            content: {
              text: "$ rm ~/weather.py",
              type: "text",
            },
            type: "content",
          },
        ],
        kind: "execute",
        sessionUpdate: "tool_call",
        title: "terminal: rm ~/weather.py",
      },
      "input",
    );

    expect(patches).toMatchObject([
      {
        operation: "delete",
        path: "~/weather.py",
        source: "input",
      },
    ]);
    expect(codePatchToText(patches[0])).toBe(
      "--- ~/weather.py\n+++ /dev/null\n@@\nDeleted file content unavailable",
    );
  });

  it("extracts every path from a terminal rm command with multiple files", () => {
    const patches = extractCodePatches(
      {
        content: [
          {
            content: {
              text: "$ rm ~/Downloads/lynwood_charity_research.md ~/Downloads/AirlineSatisfaction.csv ~/Downloads/bank_marketing.xlsx",
              type: "text",
            },
            type: "content",
          },
        ],
        kind: "execute",
        sessionUpdate: "tool_call",
        title:
          "terminal: rm ~/Downloads/lynwood_charity_research.md ~/Downloads/AirlineSatisfaction.cs...",
      },
      "input",
    );

    expect(patches).toMatchObject([
      {
        operation: "delete",
        path: "~/Downloads/lynwood_charity_research.md",
        source: "input",
      },
      {
        operation: "delete",
        path: "~/Downloads/AirlineSatisfaction.csv",
        source: "input",
      },
      {
        operation: "delete",
        path: "~/Downloads/bank_marketing.xlsx",
        source: "input",
      },
    ]);
  });

  it("preserves quoted and escaped spaces while ignoring rm options", () => {
    const patches = extractCodePatches(
      {
        title: String.raw`terminal: rm -rf "~/Downloads/tax return.xlsx" ~/Downloads/tax\ notes.md`,
      },
      "input",
    );

    expect(patches.map((patch) => patch.path)).toEqual([
      "~/Downloads/tax return.xlsx",
      "~/Downloads/tax notes.md",
    ]);
  });

  it("treats a dash-prefixed path after the rm option separator as a file", () => {
    const patches = extractCodePatches(
      { title: "terminal: rm -- -draft.md" },
      "input",
    );

    expect(patches).toMatchObject([
      { operation: "delete", path: "-draft.md", source: "input" },
    ]);
  });

  it("ignores a truncated terminal title when full command content is absent", () => {
    const patches = extractCodePatches(
      { title: "terminal: rm ~/Downloads/AirlineSatisfaction.cs..." },
      "input",
    );

    expect(patches).toEqual([]);
  });

  it("prefers a delete patch over earlier writes to the same file", () => {
    const patches = coalesceCodePatches([
      {
        operation: "write",
        path: "~/weather.py",
        newText: "print('weather')\n",
        source: "input",
      },
      {
        operation: "delete",
        path: "~/weather.py",
        source: "input",
      },
    ]);

    expect(patches).toMatchObject([
      {
        operation: "delete",
        path: "~/weather.py",
      },
    ]);
  });
});
