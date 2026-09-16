"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { FileText, Image as ImageIcon, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/text";
import { userAttachmentContentHref } from "@/features/api/resources";
import type { SessionMessageAttachment } from "@/features/runtime/session-events";

const previewableImageTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
]);

export function MessageAttachment({
  attachment,
  userId,
}: {
  attachment: SessionMessageAttachment;
  userId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const href =
    userId &&
    attachment.attachmentId &&
    previewableImageTypes.has(attachment.contentType ?? "")
      ? userAttachmentContentHref(userId, attachment.attachmentId)
      : undefined;
  const src = href && (attempt ? `${href}?retry=${attempt}` : href);
  const label = (
    <span className="flex min-w-0 items-center gap-1.5 px-2 py-1 text-xs text-ink-muted">
      {attachment.contentType?.startsWith("image/") ? (
        <ImageIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <FileText aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      )}
      <TruncatedText>{attachment.filename}</TruncatedText>
    </span>
  );
  const retry = (
    <div className="p-2 text-xs text-ink-muted">
      <p className="mb-1">Preview unavailable</p>
      <Button
        size="sm"
        onClick={() => {
          setFailed(false);
          setAttempt((current) => current + 1);
        }}
        type="button"
      >
        Retry preview
      </Button>
    </div>
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="max-w-full min-w-0 overflow-hidden rounded-md border border-hairline">
        {src && !failed ? (
          <Dialog.Trigger asChild>
            <Button
              aria-label={`Preview ${attachment.filename}`}
              className="block border-0 p-0 text-left"
              type="button"
            >
              {/* Authenticated redirects must bypass the Next image optimization proxy. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={attachment.filename}
                className="h-32 w-44 max-w-full bg-canvas object-contain"
                decoding="async"
                loading="lazy"
                onError={() => setFailed(true)}
                referrerPolicy="no-referrer"
                src={src}
              />
              {label}
            </Button>
          </Dialog.Trigger>
        ) : (
          <>
            {label}
            {src && failed && !open && retry}
          </>
        )}
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100vw-32px),1200px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-2xl outline-none"
        >
          <div className="flex min-w-0 items-center justify-between gap-3 border-b border-hairline px-3 py-2">
            <Dialog.Title className="min-w-0 truncate text-sm text-ink">
              {attachment.filename}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                aria-label="Close preview"
                tooltip="Close preview"
                size="icon"
                icon={<X className="h-4 w-4" />}
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>
          {failed ? (
            retry
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={attachment.filename}
              className="max-h-[calc(90dvh-64px)] w-full object-contain"
              onError={() => setFailed(true)}
              referrerPolicy="no-referrer"
              src={src}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
