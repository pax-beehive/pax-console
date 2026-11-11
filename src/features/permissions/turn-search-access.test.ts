import { describe, expect, it } from "vitest";
import { parseTurnSearchAccess } from "./turn-search-access";

describe("parseTurnSearchAccess", () => {
  it("keeps wildcard authorization separate from literal queries", () => {
    expect(parseTurnSearchAccess("*", "*")).toEqual({
      queries: ["*"],
      agent_ids: ["*"],
      session_ids: ["*"],
    });
    expect(
      parseTurnSearchAccess(
        "CI/CD deployment\ncicd\ncicd",
        "sess_random_a\nsess_random_b",
      ),
    ).toEqual({
      queries: ["CI/CD deployment", "cicd"],
      agent_ids: ["*"],
      session_ids: ["sess_random_a", "sess_random_b"],
    });
  });
  it("accepts self or an explicit agent list for the expanded scope", () => {
    expect(parseTurnSearchAccess("cicd", "*", "self").agent_ids).toEqual([
      "self",
    ]);
    expect(
      parseTurnSearchAccess("cicd", "*", "agent_a\nagent_random_b").agent_ids,
    ).toEqual(["agent_a", "agent_random_b"]);
    expect(() => parseTurnSearchAccess("*", "*", "*\nagent_a")).toThrow();
    expect(() => parseTurnSearchAccess("*", "*", "")).toThrow();
  });
  it("rejects empty, oversized and ambiguous wildcard scopes", () => {
    expect(() => parseTurnSearchAccess("", "*")).toThrow();
    expect(() => parseTurnSearchAccess("*\nsecret", "*")).toThrow();
    expect(() => parseTurnSearchAccess("*", "*\nsess_a")).toThrow();
    expect(() => parseTurnSearchAccess("x".repeat(257), "*")).toThrow();
    expect(() =>
      parseTurnSearchAccess(
        "*",
        Array.from({ length: 51 }, (_, i) => `sess_${i}`).join("\n"),
      ),
    ).toThrow();
  });
});
