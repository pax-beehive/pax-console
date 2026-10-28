/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownMessage, isLocalFileHref } from "./markdown-message";

afterEach(cleanup);

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({
      svg: '<svg data-testid="rendered-mermaid"></svg>',
    })),
  },
}));

describe("MarkdownMessage links", () => {
  it.each([undefined, "wide"])(
    "renders a complete visualize block as a local file reference (mode: %s)",
    (mode) => {
      const path = "/Users/alice/project/canvas [v2]*_test_%20.html";
      const block = `\uE200visualize\uE202${JSON.stringify({ path, ...(mode ? { mode } : {}) })}\uE201`;
      const { container } = render(
        <MarkdownMessage content={`**Before**\n\n${block}\n\nAfter.`} />,
      );
      expect(screen.getByText("canvas [v2]*_test_%20.html")).toHaveAttribute(
        "title",
        path,
      );
      expect(container.querySelector("strong")).toHaveTextContent("Before");
      expect(container).toHaveTextContent("After.");
      expect(container).not.toHaveTextContent("\uE200");
      expect(container).not.toHaveTextContent('"mode"');
    },
  );

  it("keeps an unfinished streamed block as text and converts it as soon as the block closes", () => {
    const partial = '\uE200visualize\uE202{"path":"/Users/alice/canvas.html"}';
    const { container, rerender } = render(
      <MarkdownMessage content={partial} streaming />,
    );
    expect(container).toHaveTextContent("\uE200visualize");
    expect(screen.queryByText("canvas.html")).not.toBeInTheDocument();
    rerender(<MarkdownMessage content={`${partial}\uE201`} streaming />);
    expect(screen.getByText("canvas.html")).toHaveAttribute(
      "title",
      "/Users/alice/canvas.html",
    );
    expect(container).not.toHaveTextContent("\uE200");
  });

  it.each(["inline", "fenced"])(
    "preserves visualize examples inside %s code",
    (kind) => {
      const block =
        '\uE200visualize\uE202{"path":"/Users/alice/canvas.html"}\uE201';
      const content =
        kind === "inline" ? `\`${block}\`` : `\`\`\`text\n${block}\n\`\`\``;
      const { container } = render(<MarkdownMessage content={content} />);
      expect(container.querySelector("code")).toHaveTextContent(block);
      expect(
        screen.queryByRole("button", { name: "Copy path" }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    "invalid-json",
    "null",
    "[]",
    '{"path":42}',
    '{"path":"https://example.com/canvas.html"}',
    '{"path":"/sessions/sess_1"}',
  ])("leaves an invalid visualize reference inert (%s)", (payload) => {
    const block = `\uE200visualize\uE202${payload}\uE201`;
    const { container } = render(<MarkdownMessage content={block} />);
    expect(container).toHaveTextContent(block);
    expect(
      screen.queryByRole("button", { name: "Copy path" }),
    ).not.toBeInTheDocument();
  });

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

  it("shows local filenames inline and keeps copy inside path details", () => {
    render(
      <MarkdownMessage content="See [main.ts](file:///Users/alice/project/main.ts:12)." />,
    );

    expect(screen.getByText("main.ts")).toHaveAttribute(
      "title",
      "/Users/alice/project/main.ts",
    );
    expect(
      screen.queryByRole("button", { name: "Copy path" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "main.ts" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "/Users/alice/project/main.ts",
    );
    expect(
      screen.getByRole("button", { name: "Copy path" }),
    ).toBeInTheDocument();
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
  it("preserves literal template backticks and backslashes in streaming and final text", () => {
    const content = "代码 `` String.raw`C:\\temp` ``，然后继续。";
    const { container, rerender } = render(
      <MarkdownMessage content={content} streaming />,
    );
    expect(container.querySelector("code")?.textContent).toBe(
      "String.raw`C:\\temp`",
    );
    rerender(<MarkdownMessage content={content} />);
    expect(container.querySelector("code")?.textContent).toBe(
      "String.raw`C:\\temp`",
    );
    expect(container).toHaveTextContent("，然后继续。");
  });

  it("lets long inline paths flow with surrounding text instead of forming a block", () => {
    const path =
      "/Users/example/项目/" + "long-directory/".repeat(12) + "file.ts";
    const { container } = render(
      <MarkdownMessage content={`修改 \`${path}\`，然后测试。`} />,
    );
    const code = container.querySelector("p > code");
    expect(code?.textContent).toBe(path);
    expect(code).toHaveClass("inline", "[overflow-wrap:anywhere]");
    expect(code).not.toHaveClass("inline-block");
  });
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
