"use client";

import { Check, Copy, FileText } from "lucide-react";
import {
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  SyntheticEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { parseLocalFileHref } from "@/features/local-files/local-file-href";
import { useLocalFileLinkContext } from "@/features/local-files/local-file-link-context";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "./dialog";
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
 * tooltip and copyable from its dialog. Inside an enabled LocalFileLinkContext
 * the text opens the session fetch dialog; otherwise it opens path details.
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);
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

  function openFile(event: SyntheticEvent) {
    stop(event);
    if (requestFetch) {
      requestFetch({ ...target, label: plainText(label) });
    } else {
      setDetailsOpen(true);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "Enter" || event.key === " ") {
      openFile(event);
    }
  }

  async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    stop(event);
    await copy(target.path);
  }

  return (
    <>
      <span className={cn("inline", className)}>
        <span
          aria-haspopup="dialog"
          className={cn(
            "cursor-pointer break-words rounded-sm underline underline-offset-4 outline-none focus-visible:ring-1 focus-visible:ring-primary-hover/60",
            requestFetch
              ? "text-primary-hover decoration-primary-hover/40 hover:decoration-primary-hover"
              : "text-ink-subtle decoration-dotted hover:text-ink",
            textClassName,
          )}
          onClick={openFile}
          onKeyDown={handleKeyDown}
          ref={labelRef}
          role="button"
          tabIndex={0}
          title={
            disabledReason ? `${target.path}\n${disabledReason}` : target.path
          }
        >
          {label}
        </span>
      </span>
      {detailsOpen && (
        <Dialog
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            labelRef.current?.focus();
          }}
          onOpenChange={setDetailsOpen}
          open
        >
          <DialogHeader
            description={
              disabledReason ?? "This file is on the agent's machine."
            }
            icon={<FileText aria-hidden className="h-4 w-4" />}
            title="Local file"
          />
          <DialogBody>
            <code className="block break-all rounded-md border border-hairline bg-canvas px-2.5 py-2 font-mono text-xs leading-5 text-ink">
              {target.path}
            </code>
            {target.line !== undefined && (
              <p className="mt-1 text-xs text-ink-tertiary">
                Referenced at line {target.line}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button
              aria-label={copied ? "Copied path" : "Copy path"}
              className="mr-auto"
              icon={
                copied ? (
                  <Check aria-hidden className="h-4 w-4" />
                ) : (
                  <Copy aria-hidden className="h-4 w-4" />
                )
              }
              onClick={handleCopy}
              size="sm"
              type="button"
            >
              {copied ? "Copied" : "Copy path"}
            </Button>
            <Button
              onClick={(event) => {
                stop(event);
                setDetailsOpen(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Close
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </>
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
