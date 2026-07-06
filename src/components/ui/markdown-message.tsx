"use client";

import Link from "next/link";
import ReactMarkdown, { Components } from "react-markdown";
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
    return (
      <code
        className={cn(
          "rounded border border-hairline bg-canvas px-1 py-0.5 font-mono text-[0.9em] text-ink",
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
  pre({ children, ...props }) {
    return (
      <pre
        className="my-3 max-w-full overflow-auto rounded-md border border-hairline bg-canvas p-3 text-xs leading-6"
        {...props}
      >
        {children}
      </pre>
    );
  },
  strong({ children, ...props }) {
    return (
      <strong className="font-semibold text-ink" {...props}>
        {children}
      </strong>
    );
  },
  table({ children, ...props }) {
    return (
      <div className="my-3 max-w-full overflow-auto">
        <table className="w-full border-collapse text-left text-xs" {...props}>
          {children}
        </table>
      </div>
    );
  },
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
        "min-w-0 break-words text-sm leading-7",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        muted ? "text-ink-subtle" : "text-ink-muted",
        className,
      )}
    >
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  );
}
