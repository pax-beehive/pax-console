"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle } from "lucide-react";
import { ReactNode } from "react";
import { Button } from "./button";

type ConfirmDialogProps = {
  cancelLabel?: string;
  children?: ReactNode;
  confirmLabel: string;
  description: ReactNode;
  disabled?: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
};

export function ConfirmDialog({
  cancelLabel = "Cancel",
  children,
  confirmLabel,
  description,
  disabled,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid w-[min(calc(100vw-32px),440px)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl shadow-black/40 outline-none">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-warning bg-canvas text-warning">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-medium text-ink">
                {title}
              </Dialog.Title>
              <Dialog.Description asChild>
                <div className="mt-2 text-sm leading-6 text-ink-muted">
                  {description}
                </div>
              </Dialog.Description>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-hairline pt-3">
            <Dialog.Close asChild>
              <Button disabled={disabled} type="button" variant="ghost">
                {cancelLabel}
              </Button>
            </Dialog.Close>
            <Button
              disabled={disabled}
              onClick={onConfirm}
              type="button"
              variant="danger"
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
