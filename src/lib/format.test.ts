import { describe, expect, it } from "vitest";
import { compactId } from "./format";

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
