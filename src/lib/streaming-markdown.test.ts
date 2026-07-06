import { describe, expect, it } from "vitest";
import { normalizeStreamingMarkdown } from "./streaming-markdown";

describe("normalizeStreamingMarkdown", () => {
  it("virtually closes an unfinished inline code span", () => {
    expect(normalizeStreamingMarkdown("路径是 `/home/kevin")).toBe(
      "路径是 `/home/kevin`",
    );
  });

  it("keeps an already closed inline code span unchanged", () => {
    expect(normalizeStreamingMarkdown("运行 `pnpm test` 后继续")).toBe(
      "运行 `pnpm test` 后继续",
    );
  });

  it("uses the same backtick run length for inline code spans", () => {
    expect(normalizeStreamingMarkdown("输出 ``value ` nested")).toBe(
      "输出 ``value ` nested``",
    );
  });

  it("virtually closes an unfinished backtick fenced code block", () => {
    expect(normalizeStreamingMarkdown("```console\npnpm test")).toBe(
      "```console\npnpm test\n```",
    );
  });

  it("virtually closes an unfinished tilde fenced code block", () => {
    expect(normalizeStreamingMarkdown("~~~sh\npnpm test")).toBe(
      "~~~sh\npnpm test\n~~~",
    );
  });

  it("keeps a closed fenced code block unchanged", () => {
    const content = "```ts\nconst value = 1;\n```\n继续说明";

    expect(normalizeStreamingMarkdown(content)).toBe(content);
  });

  it("ignores inline backticks inside fenced code blocks", () => {
    expect(normalizeStreamingMarkdown("```txt\n`not inline")).toBe(
      "```txt\n`not inline\n```",
    );
  });

  it("ignores escaped inline backticks", () => {
    expect(normalizeStreamingMarkdown("这里是 \\`literal")).toBe(
      "这里是 \\`literal",
    );
  });
});
