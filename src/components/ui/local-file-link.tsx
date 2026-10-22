"use client";

import { Check, Copy } from "lucide-react";
import {
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  SyntheticEvent,
  useMemo,
} from "react";
import { parseLocalFileHref } from "@/features/local-files/local-file-href";
import { useLocalFileLinkContext } from "@/features/local-files/local-file-link-context";
import { cn } from "@/lib/utils";
import { useCopyFeedback } from "./use-copy-feedback";

type LocalFileLinkProps = {
  /** Markdown href or absolute path, including optional `file://` and line suffix. */
  href: string;
  /** Link text. Defaults to the clean path. */
  children?: ReactNode;
  className?: string;
  textClassName?: string;
};

/**
 * A reference to a file on the agent's machine. The real path is always the
 * tooltip and always copyable. Inside an enabled LocalFileLinkContext the text
 * opens the session fetch dialog; otherwise it is inert.
 */
export function LocalFileLink({
  children,
  className,
  href,
  textClassName,
}: LocalFileLinkProps) {
  const context = useLocalFileLinkContext();
  const target = useMemo(
    () => parseLocalFileHref(href) ?? { path: href.trim() },
    [href],
  );
  const { copied, copy } = useCopyFeedback();
  const requestFetch =
    context?.enabled && context.requestFetch ? context.requestFetch : undefined;
  const disabledReason =
    context && !context.enabled ? context.disabledReason : undefined;
  const label = children ?? target.path;

  function stop(event: SyntheticEvent) {
    // Links render inside <summary> rows and clickable cards; never let a
    // copy or fetch toggle or select the surrounding element.
    event.preventDefault();
    event.stopPropagation();
  }

  function openFetch(event: SyntheticEvent) {
    stop(event);
    requestFetch?.({ ...target, label: plainText(label) });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      openFetch(event);
    }
  }

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    stop(event);
    await copy(target.path);
  }

  return (
    <span className={cn("group/local-file inline", className)}>
      {requestFetch ? (
        <span
          className={cn(
            "cursor-pointer break-words rounded-sm text-primary-hover underline decoration-primary-hover/40 underline-offset-4 outline-none hover:decoration-primary-hover focus-visible:ring-1 focus-visible:ring-primary-hover/60",
            textClassName,
          )}
          onClick={openFetch}
          onKeyDown={handleKeyDown}
          role="button"
          tabIndex={0}
          title={target.path}
        >
          {label}
        </span>
      ) : (
        <span
          className={cn(
            "break-words text-ink-subtle underline decoration-dotted underline-offset-4",
            textClassName,
          )}
          title={
            disabledReason ? `${target.path}\n${disabledReason}` : target.path
          }
        >
          {label}
        </span>
      )}
      <button
        aria-label={copied ? "Copied path" : "Copy path"}
        className={cn(
          "ml-0.5 inline-flex h-5 w-5 shrink-0 -translate-y-px items-center justify-center rounded align-middle text-ink-tertiary outline-none transition",
          "hover:bg-surface-2 hover:text-ink focus-visible:ring-1 focus-visible:ring-primary-hover/60",
          "opacity-0 focus-visible:opacity-100 group-focus-within/local-file:opacity-100 group-hover/local-file:opacity-100 [@media(hover:none)]:opacity-100",
          copied && "text-success opacity-100",
        )}
        onClick={handleCopy}
        title={copied ? "Copied" : "Copy path"}
        type="button"
      >
        {copied ? (
          <Check aria-hidden className="h-3 w-3" />
        ) : (
          <Copy aria-hidden className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}

function plainText(node: ReactNode): string | undefined {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    const text = node.map(plainText).filter(Boolean).join("");
    return text || undefined;
  }
  return undefined;
}
