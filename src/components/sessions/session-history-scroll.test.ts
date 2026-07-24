import { describe, expect, it } from "vitest";
import {
  restoredScrollTop,
  shouldLoadEarlierHistory,
} from "./session-history-scroll";

describe("session history upward pagination", () => {
  it("loads another page only near the top when an older page is available", () => {
    expect(
      shouldLoadEarlierHistory({
        hasNextPage: true,
        isFetchingNextPage: false,
        scrollTop: 96,
      }),
    ).toBe(true);
    expect(
      shouldLoadEarlierHistory({
        hasNextPage: true,
        isFetchingNextPage: false,
        scrollTop: 97,
      }),
    ).toBe(false);
    expect(
      shouldLoadEarlierHistory({
        hasNextPage: false,
        isFetchingNextPage: false,
        scrollTop: 0,
      }),
    ).toBe(false);
  });

  it("keeps the same visible content after older messages are prepended", () => {
    expect(
      restoredScrollTop(
        {
          scrollHeight: 1200,
          scrollTop: 40,
        },
        1900,
      ),
    ).toBe(740);
  });
});
