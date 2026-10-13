import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearSignInAttempt, currentSignInUrl, startSignIn } from "./sign-in";

let storage: Map<string, string>;
const replace = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  storage = new Map();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("window", {
    location: {
      pathname: "/connect/paxl",
      search: "?request=a%2Bb&source=cli",
      hash: "#continue",
      replace,
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("preserves the entire relative deep link in the gateway returnTo", () => {
  startSignIn();
  const url = new URL(replace.mock.calls[0][0], "https://paxworkspace.net");
  expect(url.pathname).toBe("/auth/login");
  expect(url.searchParams.get("returnTo")).toBe(
    "/connect/paxl?request=a%2Bb&source=cli#continue",
  );
});
it("bounds automatic callback loops without removing the manual retry URL", () => {
  startSignIn();
  startSignIn();
  expect(replace).toHaveBeenCalledTimes(1);
  expect(currentSignInUrl()).toContain("/auth/login?returnTo=");
  vi.advanceTimersByTime(15_000);
  startSignIn();
  expect(replace).toHaveBeenCalledTimes(2);
});
it("permits immediate sign-in after a restored session is cleared", () => {
  startSignIn();
  clearSignInAttempt();
  startSignIn();
  expect(replace).toHaveBeenCalledTimes(2);
});
it("can sign in when tab storage is unavailable", () => {
  vi.stubGlobal("sessionStorage", {
    getItem: () => {
      throw new Error("Storage unavailable");
    },
    removeItem: () => {
      throw new Error("Storage unavailable");
    },
  });
  startSignIn();
  clearSignInAttempt();
  expect(replace).toHaveBeenCalledTimes(1);
});
