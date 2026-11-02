import { describe, expect, it } from "vitest";
import {
  cronSessionOrigin,
  isInternalSecretarySession,
  selectVisibleSessions,
} from "./session-origin";

describe("internal Secretary execution sessions", () => {
  it("recognizes reserved execution IDs and their canonical source", () => {
    expect(
      isInternalSecretarySession({ session_id: "sess_secretary_123" }),
    ).toBe(true);
    expect(
      isInternalSecretarySession({
        session_id: "sess_native",
        source: "secretary_internal",
      }),
    ).toBe(true);
  });
  it("retains ordinary conversations, including user sessions about Secretary", () => {
    expect(
      isInternalSecretarySession({ session_id: "sess_user", source: "user" }),
    ).toBe(false);
    expect(isInternalSecretarySession({ session_id: "secretary" })).toBe(false);
    expect(isInternalSecretarySession({ session_id: "sess_secretary" })).toBe(
      false,
    );
  });
  it("filters cached execution rows while preserving pagination and normal agent chats", () => {
    const context = { agent_id: "secretary_agent", node_id: "node_1" };
    const ordinary = {
      ...context,
      session_id: "sess_user",
      name: "Secretary planning",
    };
    const page = {
      sessions: [
        { ...context, session_id: "sess_secretary_job" },
        { ...context, session_id: "sess_native", source: "secretary_internal" },
        ordinary,
      ],
      pagination: { page_num: 1, total_pages: 3 },
    };
    expect(selectVisibleSessions(page)).toEqual({
      ...page,
      sessions: [ordinary],
    });
    expect(page.sessions).toHaveLength(3);
  });
});

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
