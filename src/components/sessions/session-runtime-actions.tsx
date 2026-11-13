"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import { MoreHorizontal, Pencil, RefreshCw } from "lucide-react";
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
  onRename,
}: {
  canReset: boolean;
  isPending: boolean;
  onReset: () => Promise<unknown> | void;
  onRename?: () => void;
}) {
  const { t } = useI18n();
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
            aria-label={t("Session actions")}
            icon={<MoreHorizontal className="h-4 w-4" />}
            size="icon"
            tooltip={t("Session actions")}
            type="button"
            variant="ghost"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {onRename && (
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="h-4 w-4" />
              {t("Rename session")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={!canReset || isPending}
            onSelect={() => setResetOpen(true)}
          >
            <RefreshCw className="h-4 w-4" />
            {t("Reset stale status")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        confirmLabel={isPending ? t("Resetting...") : t("Reset status")}
        description={t(
          "This corrects the displayed session status only. It does not cancel or terminate the underlying task.",
        )}
        disabled={isPending}
        onConfirm={confirmReset}
        onOpenChange={setResetOpen}
        open={resetOpen}
        title={t("Reset stale session status?")}
      />
    </>
  );
}
