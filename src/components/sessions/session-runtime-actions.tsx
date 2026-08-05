"use client";

import { MoreHorizontal, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function SessionRuntimeActions({
  canReset,
  isPending,
  onReset,
}: {
  canReset: boolean;
  isPending: boolean;
  onReset: () => Promise<unknown> | void;
}) {
  const [resetOpen, setResetOpen] = useState(false);

  function confirmReset() {
    void Promise.resolve(onReset())
      .then(() => setResetOpen(false))
      .catch(() => undefined);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Session actions"
            icon={<MoreHorizontal className="h-4 w-4" />}
            size="icon"
            tooltip="Session actions"
            type="button"
            variant="ghost"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            disabled={!canReset || isPending}
            onSelect={() => setResetOpen(true)}
          >
            <RefreshCw className="h-4 w-4" />
            Reset stale status
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        confirmLabel={isPending ? "Resetting..." : "Reset status"}
        description="This corrects the displayed session status only. It does not cancel or terminate the underlying task."
        disabled={isPending}
        onConfirm={confirmReset}
        onOpenChange={setResetOpen}
        open={resetOpen}
        title="Reset stale session status?"
      />
    </>
  );
}
