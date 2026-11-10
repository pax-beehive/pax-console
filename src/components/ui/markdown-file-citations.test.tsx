/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalFileLinkContext } from "@/features/local-files/local-file-link-context";
import { MarkdownMessage } from "./markdown-message";

afterEach(cleanup);

function citation(path: string, attributes = "") {
  return `:codex-file-citation{path=${JSON.stringify(path)}${attributes}}`;
}

describe("Codex file citations", () => {
  it("renders the workbook output directive as a filename without fetching", () => {
    const requestFetch = vi.fn();
    const path = "/Users/me/outputs/review.xlsx";
    const { container } = render(
      <LocalFileLinkContext.Provider
        value={{
          enabled: true,
          requestFetch,
          sessionId: "sess_1",
          userId: "user_1",
        }}
      >
        <MarkdownMessage
          content={citation(path, ' artifact_kind="workbook" purpose="output"')}
        />
      </LocalFileLinkContext.Provider>,
    );

    expect(container).not.toHaveTextContent(":codex-file-citation");
    expect(screen.getByRole("button", { name: "review.xlsx" })).toHaveAttribute(
      "title",
      path,
    );
    expect(requestFetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "review.xlsx" }));
    expect(requestFetch).toHaveBeenCalledExactlyOnceWith({
      label: "review.xlsx",
      path,
    });
  });

  it("preserves emphasis around inline citations and their surrounding prose", () => {
    const { container } = render(
      <MarkdownMessage
        content={`Before **see ${citation("/Users/me/report.pdf", ' purpose="source" page_number="4"')} now** after.`}
      />,
    );
    expect(container.querySelector("strong")).toHaveTextContent(
      "see report.pdf now",
    );
    expect(container).toHaveTextContent("Before see report.pdf now after.");
  });

  it.each([
    [
      "/Users/me/review [v2]*_draft_%20#?.xlsx",
      "review [v2]*_draft_%20#?.xlsx",
    ],
    ['/Users/me/a "quoted" {book}.xlsx', 'a "quoted" {book}.xlsx'],
    ["C:\\Users\\me\\review.xlsx", "review.xlsx"],
  ])("keeps the exact quoted local path %s", (path, label) => {
    render(<MarkdownMessage content={citation(path)} />);
    expect(screen.getByText(label)).toHaveAttribute("title", path);
  });

  it("converts only when the whole streamed directive closes", () => {
    const partial =
      ':codex-file-citation{path="/Users/me/review.xlsx" artifact_kind="workbook"';
    const { container, rerender } = render(
      <MarkdownMessage content={partial} streaming />,
    );
    expect(container).toHaveTextContent(":codex-file-citation");
    expect(screen.queryByText("review.xlsx")).not.toBeInTheDocument();
    rerender(<MarkdownMessage content={`${partial}}`} streaming />);
    expect(screen.getByText("review.xlsx")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(":codex-file-citation");
  });

  it("handles multiple references, tables, blockquotes, and existing visualize blocks", () => {
    const a = citation(
      "/Users/me/a.xlsx",
      ' sheet="Revenue Model" range="C27"',
    );
    const b = citation("/Users/me/b.pdf");
    const content = `> Before ${a}\n> and ${b} after.\n\n| File |\n|---|\n| ${a} |\n\n\uE200visualize\uE202{"path":"/Users/me/chart.html"}\uE201`;
    const { container } = render(<MarkdownMessage content={content} />);
    expect(container.querySelector("blockquote")).toHaveTextContent(
      "Before a.xlsx and b.pdf after.",
    );
    expect(container.querySelector("table")).toHaveTextContent("a.xlsx");
    expect(screen.getByText("chart.html")).toBeInTheDocument();
    expect(container).not.toHaveTextContent(":codex-file-citation");
    expect(container).not.toHaveTextContent("\uE200");
  });

  it("preserves literal examples and placeholder-like prose beside a real reference", () => {
    const marker = citation("/Users/me/a.xlsx");
    const content = `PAXLOCALFILEREFERENCE0END\n\n${marker}\n\n\`${marker}\`\n\n\\${marker}`;
    const { container } = render(<MarkdownMessage content={content} />);
    expect(screen.getByText("a.xlsx")).toHaveAttribute(
      "title",
      "/Users/me/a.xlsx",
    );
    expect(container.querySelector("code")).toHaveTextContent(marker);
    expect(container).toHaveTextContent("PAXLOCALFILEREFERENCE0END");
    expect(container.textContent?.match(/:codex-file-citation/g)).toHaveLength(
      2,
    );
  });

  it.each(["inline", "fenced", "link", "escaped"])(
    "keeps %s code or literal examples untouched",
    (kind) => {
      const marker = citation("/Users/me/a.xlsx");
      const content =
        kind === "inline"
          ? `\`${marker}\``
          : kind === "fenced"
            ? `\`\`\`text\n${marker}\n\`\`\``
            : kind === "link"
              ? `[${marker}](https://example.com)`
              : `\\${marker}`;
      const { container } = render(<MarkdownMessage content={content} />);
      expect(container).toHaveTextContent(":codex-file-citation");
      expect(
        screen.queryByRole("button", { name: "a.xlsx" }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    ':codex-file-citation{path="https://example.com/a.xlsx"}',
    ':codex-file-citation{path="relative/a.xlsx"}',
    ':codex-file-citation{path="/sessions/sess_1"}',
    ':codex-file-citation{purpose="output"}',
    ':codex-file-citation{path="/Users/me/a.xlsx" invalid}',
    ':codex-file-citation{path="/Users/me/a.xlsx" path="/Users/me/b.xlsx"}',
    ':codex-file-citation{path="/Users/me/a}.xlsx',
    ':codex-unknown{path="/Users/me/a.xlsx"}',
  ])("leaves unsupported or malformed references as text: %s", (content) => {
    const { container } = render(<MarkdownMessage content={content} />);
    expect(container).toHaveTextContent(":codex-");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
