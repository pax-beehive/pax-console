import { describe, expect, it } from "vitest";
import { compactId, formatAge } from "./format";

describe("compactId", () => {
  it("returns a fallback when an optional id is missing", () => {
    expect(compactId(undefined)).toBe("unknown");
    expect(compactId(null, 10, 6, "unassigned")).toBe("unassigned");
  });

  it("keeps short ids and compacts long ids", () => {
    expect(compactId("agent-1")).toBe("agent-1");
    expect(compactId("agent-1234567890-abcdef")).toBe("agent-1234...abcdef");
  });
});

describe("formatAge", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");

  it("compacts elapsed time to the largest whole unit", () => {
    expect(formatAge("2026-10-22T11:59:15Z", now)).toBe("45s");
    expect(formatAge("2026-10-22T11:48:00Z", now)).toBe("12m");
    expect(formatAge("2026-10-22T07:00:00Z", now)).toBe("5h");
    expect(formatAge("2026-10-19T11:00:00Z", now)).toBe("3d");
  });

  it("ignores missing or invalid times and clamps future ones", () => {
    expect(formatAge(undefined, now)).toBeUndefined();
    expect(formatAge("not a date", now)).toBeUndefined();
    expect(formatAge("2026-10-22T12:05:00Z", now)).toBe("0s");
  });
});
