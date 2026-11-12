import { describe, expect, it } from "vitest";
import {
  loginPending,
  safeAuthorizationUrl,
  validLoginSecret,
} from "./agent-sign-in-flow";

describe("provider challenge links", () => {
  it.each([
    "claude.ai",
    "claude.com",
    "console.anthropic.com",
    "platform.claude.com",
  ])("allows native authorization on %s", (host) => {
    const url = `https://${host}/oauth/authorize?state=fixture&code_challenge=fixture&response_type=code`;
    expect(safeAuthorizationUrl("claude", url)).toBe(url);
  });

  it.each([
    "javascript:alert(1)",
    "http://claude.ai/oauth/authorize?state=one&code_challenge=one&response_type=code",
    "https://claude.ai.evil.test/oauth/authorize?state=one&code_challenge=one&response_type=code",
    "https://user:password@claude.ai/oauth/authorize?state=one&code_challenge=one&response_type=code",
    "https://claude.ai:8443/oauth/authorize?state=one&code_challenge=one&response_type=code",
    "https://claude.ai/oauth/authorize",
    "https://claude.ai/redirect?state=one&code_challenge=one&response_type=code",
    "not a url",
  ])("rejects unsupported links", (url) => {
    expect(safeAuthorizationUrl("claude", url)).toBeNull();
  });

  it("only allows the exact Codex device endpoint", () => {
    expect(
      safeAuthorizationUrl("codex", "https://auth.openai.com/codex/device"),
    ).toBe("https://auth.openai.com/codex/device");
    expect(
      safeAuthorizationUrl(
        "codex",
        "https://auth.openai.com/codex/device?next=evil",
      ),
    ).toBeNull();
    expect(safeAuthorizationUrl("codex", undefined)).toBeNull();
  });
});

it("bounds complete single-line credentials by UTF-8 bytes without changing the input", () => {
  expect(validLoginSecret("complete#state-suffix")).toBe(true);
  expect(validLoginSecret("a".repeat(4096))).toBe(true);
  for (const value of [
    "",
    " key",
    "key ",
    "key\ncode",
    "key\rcode",
    "key\0code",
    "a".repeat(4097),
    "界".repeat(1366),
  ]) {
    expect(validLoginSecret(value)).toBe(false);
  }
});

it("keeps only known asynchronous states pending", () => {
  for (const state of [
    "starting",
    "awaiting_code",
    "awaiting_browser",
    "exchanging",
  ]) {
    expect(loginPending({ harness: "claude", state })).toBe(true);
  }
  for (const state of [
    "logged_in",
    "logged_out",
    "succeeded",
    "failed",
    "expired",
    "cancelled",
    "unknown",
  ]) {
    expect(loginPending({ harness: "claude", state })).toBe(false);
  }
  expect(loginPending(null)).toBe(false);
});
