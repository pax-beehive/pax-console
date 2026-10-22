import { describe, expect, it } from "vitest";
import { cronSessionOrigin } from "./session-origin";

describe("cron session provenance", () => {
  it("retains the task name and creation run from session metadata", () => {
    const origin = {
      kind: "cronjob",
      cronjob_id: "cron_1",
      run_id: "run_1",
      name: "Daily review",
    };
    expect(cronSessionOrigin({ metadata: { origin } })).toEqual(origin);
  });
  it("ignores absent, unknown, or incomplete provenance", () => {
    for (const origin of [
      undefined,
      null,
      "cronjob",
      {},
      { kind: "project" },
      { kind: "cronjob", name: "Incomplete" },
    ]) {
      expect(cronSessionOrigin({ metadata: { origin } })).toBeUndefined();
    }
  });
});
