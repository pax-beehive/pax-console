import { describe, expect, it } from "vitest";
import {
  extractToolCallOutputUpdate,
  mergeToolCallOutput,
} from "./tool-call-output";

describe("tool call output", () => {
  it("extracts Codex terminal output deltas", () => {
    expect(
      extractToolCallOutputUpdate({
        _meta: {
          terminal_output_delta: {
            data: "first line\n",
            terminal_id: "exec-1",
          },
        },
      }),
    ).toEqual({ mode: "append", value: "first line\n" });
  });

  it("appends output fragments into one terminal transcript", () => {
    expect(
      mergeToolCallOutput("first line\n", "second line\n", "append"),
    ).toBe("first line\nsecond line\n");
  });
});
