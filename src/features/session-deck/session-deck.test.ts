/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it } from "vitest";
import {
  dismissSessionFromDeck,
  readSessionDeck,
  rememberSessionInDeck,
  reorderSessionDeck,
  restoreSessionToDeck,
  sessionDeckStorageKey,
  writeSessionDeck,
} from "./session-deck";

describe("session deck", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists only session ids for the current user", () => {
    writeSessionDeck(window.localStorage, "user_1", ["sess_1", "sess_2"]);

    expect(readSessionDeck(window.localStorage, "user_1")).toEqual([
      "sess_1",
      "sess_2",
    ]);
    expect(readSessionDeck(window.localStorage, "user_2")).toEqual([]);
  });

  it("ignores malformed, duplicate, and unsaved new-session entries", () => {
    window.localStorage.setItem(
      sessionDeckStorageKey("user_1"),
      JSON.stringify(["sess_1", "new", "sess_1", "", 42]),
    );

    expect(readSessionDeck(window.localStorage, "user_1")).toEqual(["sess_1"]);
    expect(rememberSessionInDeck(["sess_1"], "sess_1")).toEqual(["sess_1"]);
    expect(rememberSessionInDeck(["sess_1"], "new")).toEqual(["sess_1"]);
  });

  it("dismisses without deleting and restores at the original position", () => {
    const dismissed = dismissSessionFromDeck(
      ["sess_1", "sess_2", "sess_3"],
      "sess_2",
    );

    expect(dismissed).toEqual(["sess_1", "sess_3"]);
    expect(restoreSessionToDeck(dismissed, "sess_2", 1)).toEqual([
      "sess_1",
      "sess_2",
      "sess_3",
    ]);
  });

  it("reorders known sessions without dropping concurrent entries", () => {
    expect(
      reorderSessionDeck(
        ["sess_1", "sess_2", "sess_3"],
        ["sess_2", "unknown", "sess_1"],
      ),
    ).toEqual(["sess_2", "sess_1", "sess_3"]);
  });
});
