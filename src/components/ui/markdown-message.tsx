"use client";

import Link from "next/link";
import {
  ComponentPropsWithoutRef,
  ReactNode,
  isValidElement,
  useState,
} from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { normalizeStreamingMarkdown } from "@/lib/streaming-markdown";

type MarkdownMessageProps = {
  className?: string;
  content: string;
  muted?: boolean;
  streaming?: boolean;
};

const markdownComponents: Components = {
  a({ children, href, ...props }) {
    if (!href) {
      return <span>{children}</span>;
    }

    if (href.startsWith("/")) {
      return (
        <Link
          className="text-primary-hover underline decoration-primary-hover/40 underline-offset-4 hover:decoration-primary-hover"
          href={href}
          {...props}
        >
          {children}
        </Link>
      );
    }

    return (
      <a
        className="break-words text-primary-hover underline decoration-primary-hover/40 underline-offset-4 hover:decoration-primary-hover"
        href={href}
        rel="noreferrer"
        target="_blank"
        {...props}
      >
        {children}
      </a>
    );
  },
  blockquote({ children, ...props }) {
    return (
      <blockquote
        className="my-3 border-l border-hairline-strong pl-3 text-ink-subtle"
        {...props}
      >
        {children}
      </blockquote>
    );
  },
  code({ children, className, ...props }) {
    const isBlockCode = /\blanguage-/.test(className ?? "");

    if (isBlockCode) {
      return (
        <code className={cn("font-mono text-[#f4f4f5]", className)} {...props}>
          {children}
        </code>
      );
    }

    return (
      <code
        className={cn(
          "rounded border border-white/10 bg-[#242424] px-1 py-0.5 font-mono text-[0.9em] text-[#f4f4f5]",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  },
  h1({ children, ...props }) {
    return (
      <h1 className="mb-2 mt-4 text-base font-semibold text-ink" {...props}>
        {children}
      </h1>
    );
  },
  h2({ children, ...props }) {
    return (
      <h2 className="mb-2 mt-4 text-sm font-semibold text-ink" {...props}>
        {children}
      </h2>
    );
  },
  h3({ children, ...props }) {
    return (
      <h3 className="mb-2 mt-3 text-sm font-medium text-ink" {...props}>
        {children}
      </h3>
    );
  },
  hr(props) {
    return <hr className="my-4 border-hairline" {...props} />;
  },
  li({ children, ...props }) {
    return (
      <li className="my-1 pl-1" {...props}>
        {children}
      </li>
    );
  },
  ol({ children, ...props }) {
    return (
      <ol className="my-2 list-decimal space-y-1 pl-5" {...props}>
        {children}
      </ol>
    );
  },
  p({ children, ...props }) {
    return (
      <p className="my-2 whitespace-pre-wrap" {...props}>
        {children}
      </p>
    );
  },
  pre: MarkdownPre,
  strong({ children, ...props }) {
    return (
      <strong className="font-semibold text-ink" {...props}>
        {children}
      </strong>
    );
  },
  table: MarkdownTable,
  td({ children, ...props }) {
    return (
      <td className="border border-hairline px-2 py-1 align-top" {...props}>
        {children}
      </td>
    );
  },
  th({ children, ...props }) {
    return (
      <th
        className="border border-hairline bg-surface-2 px-2 py-1 font-medium text-ink"
        {...props}
      >
        {children}
      </th>
    );
  },
  ul({ children, ...props }) {
    return (
      <ul className="my-2 list-disc space-y-1 pl-5" {...props}>
        {children}
      </ul>
    );
  },
};

function MarkdownPre({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"pre">) {
  const [copied, setCopied] = useState(false);
  const codeText = textFromReactNode(children).replace(/\n$/, "");
  const language = languageFromReactNode(children) ?? "text";

  async function copyCode() {
    if (!codeText || typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="my-3 max-w-full overflow-hidden rounded-lg border border-white/10 bg-[#242424] text-[#f4f4f5] shadow-sm">
      <div className="flex h-9 items-center justify-between gap-3 px-3">
        <span className="min-w-0 truncate font-mono text-xs text-[#b8b8b8]">
          {language}
        </span>
        <button
          aria-label={copied ? "Copied code" : "Copy code"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#b8b8b8] transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!codeText}
          onClick={copyCode}
          type="button"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
      <pre
        className={cn(
          "max-w-full overflow-auto bg-transparent px-3 pb-3 pt-1 text-xs leading-6",
          "[&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[#f4f4f5]",
          "[&_.hljs-attr]:text-[#00d7b0] [&_.hljs-attribute]:text-[#79c0ff]",
          "[&_.hljs-built_in]:text-[#ffa657] [&_.hljs-bullet]:text-[#79c0ff]",
          "[&_.hljs-comment]:text-[#8b949e] [&_.hljs-doctag]:text-[#ff7b72]",
          "[&_.hljs-keyword]:text-[#ff7b72] [&_.hljs-literal]:text-[#79c0ff]",
          "[&_.hljs-meta]:text-[#8b949e] [&_.hljs-name]:text-[#7ee787]",
          "[&_.hljs-number]:text-[#79c0ff] [&_.hljs-operator]:text-[#ff7b72]",
          "[&_.hljs-params]:text-[#f4f4f5] [&_.hljs-property]:text-[#00d7b0]",
          "[&_.hljs-punctuation]:text-[#c9d1d9] [&_.hljs-regexp]:text-[#a5d6ff]",
          "[&_.hljs-section]:text-[#d2a8ff] [&_.hljs-selector-class]:text-[#d2a8ff]",
          "[&_.hljs-selector-id]:text-[#d2a8ff] [&_.hljs-string]:text-[#00d7b0]",
          "[&_.hljs-subst]:text-[#f4f4f5] [&_.hljs-symbol]:text-[#79c0ff]",
          "[&_.hljs-tag]:text-[#7ee787] [&_.hljs-title]:text-[#d2a8ff]",
          "[&_.hljs-type]:text-[#ffa657] [&_.hljs-variable]:text-[#ffa657]",
          className,
        )}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

function MarkdownTable({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<"table">) {
  const [copied, setCopied] = useState(false);
  const tableText = tableTextFromReactNode(children);

  async function copyTable() {
    if (!tableText || typeof navigator === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(tableText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="group relative my-3 max-w-full overflow-auto">
      <button
        aria-label={copied ? "Copied table" : "Copy table"}
        className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-surface-1 text-ink-tertiary opacity-0 shadow-sm transition hover:border-hairline-strong hover:bg-surface-2 hover:text-ink focus:opacity-100 group-hover:opacity-100"
        disabled={!tableText}
        onClick={copyTable}
        type="button"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <table
        className={cn("w-full border-collapse text-left text-xs", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

function languageFromReactNode(node: ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const language = languageFromReactNode(child);
      if (language) {
        return language;
      }
    }
    return undefined;
  }

  if (isValidElement<{ className?: string; children?: ReactNode }>(node)) {
    const match = /\blanguage-([^\s]+)/.exec(node.props.className ?? "");
    return match?.[1];
  }

  return undefined;
}

function textFromReactNode(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromReactNode).join("");
  }

  if (typeof node === "object" && "props" in node) {
    return textFromReactNode(
      (node as { props?: { children?: ReactNode } }).props?.children,
    );
  }

  return "";
}

function tableTextFromReactNode(node: ReactNode): string {
  const rows = tableRowsFromReactNode(node)
    .filter((row) => row.length > 0)
    .map((row) => row.map(normalizeMarkdownTableCell));

  if (rows.length === 0) {
    return "";
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  );
  const [header, ...body] = normalizedRows;
  const divider = Array.from({ length: columnCount }, () => "---");

  return [header, divider, ...body]
    .map((row) => `| ${row.join(" | ")} |`)
    .join("\n");
}

function normalizeMarkdownTableCell(cell: string) {
  return cell.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|");
}

function tableRowsFromReactNode(node: ReactNode): string[][] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(tableRowsFromReactNode);
  }

  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return [];
  }

  if (node.type === "tr") {
    return [tableCellsFromReactNode(node.props.children)];
  }

  return tableRowsFromReactNode(node.props.children);
}

function tableCellsFromReactNode(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === "boolean") {
    return [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(tableCellsFromReactNode);
  }

  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return [];
  }

  if (node.type === "td" || node.type === "th") {
    return [textFromReactNode(node.props.children)];
  }

  return tableCellsFromReactNode(node.props.children);
}

export function MarkdownMessage({
  className,
  content,
  muted,
  streaming,
}: MarkdownMessageProps) {
  const renderedContent = streaming
    ? normalizeStreamingMarkdown(content)
    : content;

  return (
    <div
      className={cn(
        "min-w-0 break-words text-sm leading-6",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        muted ? "text-ink-subtle" : "text-ink-muted",
        className,
      )}
    >
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[
          [rehypeHighlight, { detect: false, ignoreMissing: true }],
        ]}
        remarkPlugins={[remarkGfm]}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  );
}
