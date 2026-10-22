/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalFileLinkContext,
  type LocalFileLinkContextValue,
} from "@/features/local-files/local-file-link-context";
import { LocalFileLink } from "./local-file-link";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderWithContext(
  value: LocalFileLinkContextValue | null,
  href = "file:///Users/me/proj/out/report.md:12",
) {
  return render(
    <LocalFileLinkContext.Provider value={value}>
      <p>
        See <LocalFileLink href={href}>report.md</LocalFileLink> now.
      </p>
    </LocalFileLinkContext.Provider>,
  );
}

describe("LocalFileLink", () => {
  it("shows the full real path as the native tooltip", () => {
    renderWithContext(null);

    expect(screen.getByText("report.md")).toHaveAttribute(
      "title",
      "/Users/me/proj/out/report.md",
    );
  });

  it("copies only the clean absolute path and briefly shows a check", async () => {
    vi.useFakeTimers();
    renderWithContext(null);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
    });

    expect(writeText).toHaveBeenCalledWith("/Users/me/proj/out/report.md");
    expect(
      screen.getByRole("button", { name: "Copied path" }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(
      screen.getByRole("button", { name: "Copy path" }),
    ).toBeInTheDocument();
  });

  it("falls back to execCommand when the clipboard API is missing", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    renderWithContext(null, "C:\\Users\\me\\app.ts:3");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
    });

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copied path" }),
    ).toBeInTheDocument();
  });

  it("is inert without a provider but copy still works", async () => {
    renderWithContext(null);

    expect(
      screen.queryByRole("button", { name: "report.md" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("report.md"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
    });
    expect(writeText).toHaveBeenCalledWith("/Users/me/proj/out/report.md");
  });

  it("requests a fetch with the parsed line when the context is enabled", () => {
    const requestFetch = vi.fn();
    renderWithContext({
      enabled: true,
      requestFetch,
      sessionId: "sess_1",
      userId: "user_1",
    });

    fireEvent.click(screen.getByRole("button", { name: "report.md" }));
    expect(requestFetch).toHaveBeenCalledWith({
      label: "report.md",
      line: 12,
      path: "/Users/me/proj/out/report.md",
    });

    requestFetch.mockClear();
    fireEvent.keyDown(screen.getByRole("button", { name: "report.md" }), {
      key: "Enter",
    });
    expect(requestFetch).toHaveBeenCalledTimes(1);
  });

  it("stays inert with copy available when the context is disabled (E2EE)", async () => {
    const requestFetch = vi.fn();
    renderWithContext({
      disabledReason:
        "Fetching is unavailable for end-to-end encrypted sessions",
      enabled: false,
      requestFetch,
      sessionId: "sess_1",
      userId: "user_1",
    });

    expect(
      screen.queryByRole("button", { name: "report.md" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("report.md"));
    expect(requestFetch).not.toHaveBeenCalled();
    expect(screen.getByText("report.md").getAttribute("title")).toContain(
      "/Users/me/proj/out/report.md",
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
    });
    expect(writeText).toHaveBeenCalledWith("/Users/me/proj/out/report.md");
  });

  it("does not toggle a surrounding details summary when copying", async () => {
    render(
      <details>
        <summary>
          <LocalFileLink href="/Users/me/a.ts" />
        </summary>
        body
      </details>,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy path" }));
    });
    expect(document.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("/Users/me/a.ts")).toBeInTheDocument();
  });
});
