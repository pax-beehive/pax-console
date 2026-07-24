/* @vitest-environment jsdom */

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDocumentTitle } from "./use-document-title";

afterEach(() => {
  document.title = "";
});

describe("useDocumentTitle", () => {
  it("sets, updates, and restores the browser title", () => {
    document.title = "PAX Console";
    const { rerender, unmount } = renderHook(
      ({ title }) => useDocumentTitle(title),
      {
        initialProps: { title: "First session" },
      },
    );

    expect(document.title).toBe("First session");

    rerender({ title: "Renamed session" });
    expect(document.title).toBe("Renamed session");

    unmount();
    expect(document.title).toBe("PAX Console");
  });
});
