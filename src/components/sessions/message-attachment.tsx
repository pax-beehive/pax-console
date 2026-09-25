"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  X,
} from "lucide-react";
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
  gallery,
}: {
  attachment: SessionMessageAttachment;
  userId?: string;
  gallery?: SessionMessageAttachment[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(attachment.attachmentId);
  const images = (gallery ?? [attachment]).filter(
    (item) =>
      userId &&
      item.attachmentId &&
      previewableImageTypes.has(item.contentType ?? ""),
  );
  const selectedIndex = Math.max(
    0,
    images.findIndex((item) => item.attachmentId === selectedId),
  );
  const selected = images[selectedIndex] ?? attachment;
  const canPrevious = selectedIndex > 0;
  const canNext = selectedIndex >= 0 && selectedIndex < images.length - 1;
  const multiple = images.length > 1;
  function navigate(direction: -1 | 1) {
    if (direction === -1 ? canPrevious : canNext)
      setSelectedId(images[selectedIndex + direction].attachmentId);
  }
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
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setSelectedId(attachment.attachmentId);
      }}
    >
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
          onKeyDown={(event) => {
            if (event.altKey || event.ctrlKey || event.metaKey || !multiple)
              return;
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              event.stopPropagation();
              navigate(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(calc(100vw-32px),1200px)] flex-col -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-hairline bg-surface-1 shadow-2xl outline-none"
        >
          <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b border-hairline px-3 py-2">
            <Dialog.Title className="min-w-0 truncate text-sm text-ink">
              {selected.filename}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                aria-label="Close preview"
                size="icon"
                icon={<X className="h-4 w-4" />}
                type="button"
                variant="ghost"
              />
            </Dialog.Close>
          </div>
          <div
            className={
              multiple
                ? "flex h-[min(65dvh,800px)] min-h-0 items-center justify-center bg-canvas"
                : undefined
            }
          >
            <AttachmentPreviewImage
              key={selected.attachmentId}
              attachment={selected}
              userId={userId}
              gallery={multiple}
            />
          </div>
          {multiple && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-hairline px-3 py-2">
              <Button
                aria-label="Previous image"
                disabled={!canPrevious}
                onClick={() => navigate(-1)}
                size="icon"
                className="h-11 w-11 disabled:opacity-30"
                icon={<ChevronLeft className="h-5 w-5" />}
                type="button"
                variant="ghost"
              />
              <span
                role="status"
                aria-label="Image position"
                className="text-sm tabular-nums text-ink-muted"
              >
                {selectedIndex + 1} / {images.length}
              </span>
              <Button
                aria-label="Next image"
                disabled={!canNext}
                onClick={() => navigate(1)}
                size="icon"
                className="h-11 w-11 disabled:opacity-30"
                icon={<ChevronRight className="h-5 w-5" />}
                type="button"
                variant="ghost"
              />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function AttachmentPreviewImage({
  attachment,
  userId,
  gallery,
}: {
  attachment: SessionMessageAttachment;
  userId?: string;
  gallery: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const href =
    userId &&
    attachment.attachmentId &&
    previewableImageTypes.has(attachment.contentType ?? "")
      ? userAttachmentContentHref(userId, attachment.attachmentId)
      : undefined;
  if (failed || !href)
    return (
      <div className="p-4 text-sm text-ink-muted">
        <p className="mb-2">Preview unavailable</p>
        <Button
          size="sm"
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((current) => current + 1);
          }}
        >
          Retry preview
        </Button>
      </div>
    );
  return (
    // Authenticated redirects must bypass Next image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={attachment.filename}
      className={
        gallery
          ? "h-full w-full object-contain"
          : "max-h-[calc(90dvh-64px)] w-full object-contain"
      }
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={attempt ? `${href}?retry=${attempt}` : href}
    />
  );
}
