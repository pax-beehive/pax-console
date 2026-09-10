"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { NodeSecretChannelPush } from "@/components/resources/node-secret-channel-push";

export function SessionSecretDialog({
  open,
  onOpenChange,
  nodeId,
  userId,
  onDelivered,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  userId: string;
  onDelivered: (receipt: { fileRef: string; expiresAt: string }) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[80dvh] w-[min(calc(100vw-32px),480px)] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-lg border border-hairline bg-surface-2 p-4 shadow-2xl outline-none">
          <Dialog.Title className="text-base font-medium">
            Securely send password / token
          </Dialog.Title>
          <Dialog.Description className="break-words text-sm text-ink-muted">
            Target node: {nodeId}. Only the temporary file path and expiry will
            be added to this conversation’s draft. Review and send it when
            ready. The secret is never added to chat.
          </Dialog.Description>
          <NodeSecretChannelPush
            nodeId={nodeId}
            userId={userId}
            onDelivered={onDelivered}
          />
          <Dialog.Close asChild>
            <Button type="button" variant="ghost">
              Close
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
