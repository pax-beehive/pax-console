import { expect, it } from "vitest";
import type { BrowserState } from "./api";
import { followBrowser } from "./follow-browser";
const state: BrowserState = {
  policy: { paused: false, origins: [] },
  pending: [],
  grants: [],
  sensitiveSessions: [],
  operator: null,
  workers: [
    { session: "a", seen: 1 },
    { session: "b", seen: 2 },
  ],
  audit: [
    { at: "", event: "viewer.action", session: "a" },
    { at: "", event: "tool.started", session: "b" },
  ],
};
it("follows agent activity rather than captures or heartbeat order", () => {
  expect(followBrowser(state)).toBe("b");
  expect(followBrowser({ ...state, operator: "a" })).toBe("a");
  expect(followBrowser({ ...state, audit: [] }, "a")).toBe("a");
  expect(followBrowser({ ...state, audit: [] })).toBe("");
  expect(followBrowser({ ...state, workers: [state.workers[0]] }, "b")).toBe(
    "a",
  );
});
