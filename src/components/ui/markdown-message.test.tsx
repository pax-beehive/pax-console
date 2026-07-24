/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownMessage, isLocalFileHref } from "./markdown-message";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg data-testid="rendered-mermaid"></svg>',
    })),
  },
}));

describe("MarkdownMessage links", () => {
  it.each([
    "/Users/alice/project/app.ts:12",
    "/home/alice/project/app.ts",
    "/private/tmp/output.txt",
    "file:///Users/alice/project/app.ts",
    "C:\\Users\\alice\\project\\app.ts",
  ])("recognizes local file href %s", (href) => {
    expect(isLocalFileHref(href)).toBe(true);
  });

  it("renders a local file path without a clickable link", () => {
    render(
      <MarkdownMessage content="See [app.ts](/Users/alice/project/app.ts:12)." />,
    );

    expect(screen.getByText("app.ts")).not.toHaveAttribute("href");
    expect(
      screen.queryByRole("link", { name: "app.ts" }),
    ).not.toBeInTheDocument();
  });

  it("keeps console routes and web URLs clickable", () => {
    render(
      <MarkdownMessage content="[session](/sessions/sess_1) [docs](https://example.com/docs)" />,
    );

    expect(screen.getByRole("link", { name: "session" })).toHaveAttribute(
      "href",
      "/sessions/sess_1",
    );
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );
  });
});

describe("MarkdownMessage GFM syntax", () => {
  it("does not treat home-directory tildes as strikethrough delimiters", () => {
    const content =
      "Copy ~/pax_workspace/pax-nexus into ~/pax_workspace/backup.";
    const { container } = render(<MarkdownMessage content={content} />);

    expect(container).toHaveTextContent(content);
    expect(container.querySelector("del")).not.toBeInTheDocument();
  });

  it("keeps double-tilde strikethrough support", () => {
    const { container } = render(
      <MarkdownMessage content="This is ~~deprecated~~." />,
    );

    expect(container.querySelector("del")).toHaveTextContent("deprecated");
  });
});

describe("MarkdownMessage Mermaid blocks", () => {
  it("previews Mermaid by default and switches between preview and code", async () => {
    render(
      <MarkdownMessage content={"```mermaid\nflowchart LR\n  A --> B\n```"} />,
    );

    expect(
      screen.getByLabelText("Mermaid diagram preview"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy code" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show Mermaid code" }),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId("rendered-mermaid")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Show Mermaid code" }));
    expect(
      screen.getByRole("button", { name: "Preview Mermaid diagram" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/flowchart LR/)).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Preview Mermaid diagram" }),
    );
    expect(
      screen.getByLabelText("Mermaid diagram preview"),
    ).toBeInTheDocument();
  });
});
