"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DialogProps = {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** `sm` matches ConfirmDialog; `lg` fits an embedded artifact viewer. */
  size?: "sm" | "lg";
};

/**
 * General-purpose modal with the same surface treatment as ConfirmDialog.
 * Compose DialogHeader / DialogBody / DialogFooter inside it; multi-step
 * flows keep one Dialog mounted and swap only its content.
 */
export function Dialog({
  children,
  onOpenChange,
  open,
  size = "sm",
}: DialogProps) {
  return (
    <DialogPrimitive.Root onOpenChange={onOpenChange} open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none",
            size === "lg"
              ? "h-[min(calc(100dvh-32px),820px)] w-[min(calc(100vw-32px),1040px)]"
              : "w-[min(calc(100vw-32px),480px)]",
          )}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function DialogHeader({
  description,
  icon,
  title,
}: {
  description?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
}) {
  return (
    <div className="flex min-w-0 shrink-0 items-start gap-3">
      {icon && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-canvas text-ink-muted">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <DialogPrimitive.Title className="break-words text-base font-medium text-ink">
          {title}
        </DialogPrimitive.Title>
        {description && (
          <div className="mt-1 text-sm leading-6 text-ink-muted">
            {description}
          </div>
        )}
      </div>
    </div>
  );
}

export function DialogBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-h-0 min-w-0 flex-1 overflow-auto text-sm leading-6 text-ink-muted",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-hairline pt-3">
      {children}
    </div>
  );
}
