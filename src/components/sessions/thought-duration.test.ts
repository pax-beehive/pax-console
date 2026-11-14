import { describe, expect, it } from "vitest";
import type {
  PermissionRequestEvent,
  WorkActivityEvent,
} from "@/features/runtime/session-events";
import { thoughtDurationLabel, thoughtEndAt } from "./thought-duration";

const at = (seconds: number) =>
  new Date(Date.UTC(2026, 10, 13, 20, 0, seconds)).toISOString();
const thought = (
  seconds: number,
  overrides: Partial<Extract<WorkActivityEvent, { type: "progress" }>> = {},
): WorkActivityEvent => ({
  type: "progress",
  id: `thought-${seconds}`,
  sessionId: "session",
  content: "Inspecting the code",
  streaming: true,
  sessionUpdate: "agent_thought_chunk",
  createdAt: at(seconds),
  ...overrides,
});
const tool = (seconds: number): WorkActivityEvent => ({
  type: "tool_call",
  id: `tool-${seconds}`,
  sessionId: "session",
  name: "Read",
  status: "done",
  createdAt: at(seconds),
});
const approval = (seconds: number): PermissionRequestEvent => ({
  type: "permission_request",
  id: `approval-${seconds}`,
  requestId: `request-${seconds}`,
  sessionId: "session",
  title: "Run a command",
  options: [],
  createdAt: at(seconds),
});

describe("Given a thought segment in the activity timeline", () => {
  it("ends at the next tool before that tool's execution time", () => {
    const events = [thought(0), tool(1)];

    expect(thoughtEndAt(events, 0, [], at(30))).toBe(at(1));
    expect(thoughtDurationLabel(at(0), thoughtEndAt(events, 0))).toBe("1s");
  });

  it("uses an earlier approval boundary without counting approval wait", () => {
    expect(
      thoughtEndAt([thought(0), tool(30)], 0, [approval(20), approval(1)]),
    ).toBe(at(1));
  });

  it("ignores approvals before the thought and after its next boundary", () => {
    expect(
      thoughtEndAt([thought(2), tool(3)], 0, [approval(1), approval(10)]),
    ).toBe(at(3));
  });

  it("ends a final thought at an approval even in a mixed tool group", () => {
    expect(thoughtEndAt([tool(0), thought(1)], 1, [approval(2)], at(30))).toBe(
      at(2),
    );
  });

  it("uses the completion boundary for a pure thought group", () => {
    const events = [thought(0)];

    expect(thoughtEndAt(events, 0, [], at(1))).toBe(at(1));
    expect(
      thoughtDurationLabel(at(0), thoughtEndAt(events, 0, [], at(1))),
    ).toBe("1s");
  });

  it("does not count the rest of a mixed tool group as a final thought", () => {
    expect(thoughtEndAt([tool(0), thought(1)], 1, [], at(30))).toBeUndefined();
  });

  it("does not time legacy aggregate thoughts spanning a mixed tool group", () => {
    expect(
      thoughtEndAt(
        [thought(0, { streaming: false }), tool(1)],
        0,
        [approval(1)],
        at(30),
      ),
    ).toBeUndefined();
  });

  it("can time a stored segmented thought before its next tool", () => {
    expect(
      thoughtEndAt(
        [
          thought(0, { streaming: false, historyTextLayout: "segment" }),
          tool(1),
        ],
        0,
      ),
    ).toBe(at(1));
  });

  it.each(["invalid", at(-1)])(
    "does not guess past an invalid or reversed direct boundary %s",
    (createdAt) => {
      expect(
        thoughtEndAt(
          [thought(0), { ...tool(1), createdAt }],
          0,
          [approval(1)],
          at(30),
        ),
      ).toBeUndefined();
    },
  );

  it("does not invent a boundary for an unfinished thought", () => {
    expect(thoughtEndAt([thought(0)], 0)).toBeUndefined();
  });

  it("rejects invalid starts, non-thought events and absent indices", () => {
    expect(
      thoughtEndAt([thought(0, { createdAt: "invalid" })], 0, [], at(1)),
    ).toBeUndefined();
    expect(thoughtEndAt([tool(0), thought(1)], 0)).toBeUndefined();
    expect(thoughtEndAt([thought(0)], 1)).toBeUndefined();
  });

  it("ignores malformed approvals and invalid group completion times", () => {
    expect(
      thoughtEndAt(
        [thought(0)],
        0,
        [{ ...approval(1), createdAt: "invalid" }],
        "invalid",
      ),
    ).toBeUndefined();
    expect(thoughtEndAt([thought(1)], 0, [], at(0))).toBeUndefined();
  });
});

describe("Given observed thought start and end timestamps", () => {
  it.each([
    [1000, "1s"],
    [100, "0.1s"],
    [1250, "1.3s"],
    [0, "0s"],
  ])("formats %sms as %s without unnecessary decimal zeroes", (ms, label) => {
    expect(
      thoughtDurationLabel(
        at(0),
        new Date(Date.parse(at(0)) + ms).toISOString(),
      ),
    ).toBe(label);
  });

  it.each([
    ["invalid", at(1)],
    [at(0), "invalid"],
    [at(1), at(0)],
    [at(0), undefined],
  ])("omits duration for invalid or unavailable boundaries", (start, end) => {
    expect(thoughtDurationLabel(start!, end)).toBeUndefined();
  });
});
