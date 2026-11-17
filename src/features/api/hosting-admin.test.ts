import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";
import {
  changeHostingAdmin,
  dollarsToMicrousd,
  formatHostingDollars,
  formatHostingBudgetReset,
  microusdToDollars,
  parseTokenLimit,
  readHostingAdmin,
} from "./hosting-admin";

vi.mock("./client", () => ({ apiFetch: vi.fn() }));
beforeEach(() => vi.mocked(apiFetch).mockReset());

describe("hosting administration API", () => {
  it("uses the authenticated self endpoint with bounded, encoded filters and cursors", async () => {
    const controller = new AbortController();
    await readHostingAdmin(
      {
        user_query: "a+b@example.com",
        users_after: "usr_1",
        requests_before: "req_2",
        request_status: "settled",
      },
      controller.signal,
    );
    const [url, init] = vi.mocked(apiFetch).mock.calls[0];
    expect(String(url).split("?")[0]).toBe("/api/v1/user/self/hosting-admin");
    expect(
      Object.fromEntries(new URLSearchParams(String(url).split("?")[1])),
    ).toEqual({
      limit: "25",
      user_query: "a+b@example.com",
      users_after: "usr_1",
      requests_before: "req_2",
      request_status: "settled",
    });
    expect(init?.signal).toBe(controller.signal);
  });

  it("sends one versioned PATCH without provider credentials or caller identity", async () => {
    await changeHostingAdmin({
      revision: 8,
      action: "user",
      target_id: "usr_a",
      monthly_microusd: 5_000_000,
      monthly_tokens: 200_000,
      access_paused: true,
    });
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith(
      "/api/v1/user/self/hosting-admin",
      {
        method: "PATCH",
        body: JSON.stringify({
          revision: 8,
          action: "user",
          target_id: "usr_a",
          monthly_microusd: 5_000_000,
          monthly_tokens: 200_000,
          access_paused: true,
        }),
      },
    );
  });
});

describe("exact budget input", () => {
  it.each([
    ["5", 5_000_000],
    ["0", 0],
    ["0.000001", 1],
    [" 1.234567 ", 1_234_567],
    ["9007199254.740991", Number.MAX_SAFE_INTEGER],
  ])("parses %s without rounding", (value, expected) => {
    expect(dollarsToMicrousd(String(value))).toBe(expected);
    expect(dollarsToMicrousd(microusdToDollars(Number(expected)))).toBe(
      expected,
    );
  });
  it.each([
    "",
    "-1",
    "NaN",
    "Infinity",
    "1e3",
    ".5",
    "1.",
    "1.0000001",
    "1,000",
    "9007199254.740992",
  ])("rejects unsafe dollar input %s", (value) =>
    expect(() => dollarsToMicrousd(value)).toThrow(),
  );
  it.each(["", "-1", "1.2", "NaN", "Infinity", "1e3", "9007199254740992"])(
    "rejects invalid token input %s",
    (value) => expect(() => parseTokenLimit(value)).toThrow(),
  );
  it("allows zero monthly allowances but requires positive output caps", () => {
    expect(parseTokenLimit("0")).toBe(0);
    expect(() => parseTokenLimit("0", 1)).toThrow();
    expect(formatHostingDollars(1)).toBe("$0.000001");
    expect(formatHostingDollars(5_000_000)).toBe("$5.00");
  });
});

it("shows only valid monthly reset dates in UTC", () => {
  expect(
    formatHostingBudgetReset("2026-11-01T00:00:00Z", "2026-12-01T00:00:00Z"),
  ).toBe("Dec 1, 2026");
  expect(formatHostingBudgetReset()).toBeNull();
  expect(
    formatHostingBudgetReset("invalid", "2026-12-01T00:00:00Z"),
  ).toBeNull();
  expect(
    formatHostingBudgetReset("2026-12-01T00:00:00Z", "2026-11-01T00:00:00Z"),
  ).toBeNull();
});
