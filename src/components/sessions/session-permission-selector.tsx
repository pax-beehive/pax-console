"use client";

import { useId, useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import type {
  AgentPermissionCatalog,
  AgentPermissionChoice,
} from "@/features/api/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PAX_AUTO_APPROVE_CHOICE_ID,
  PAX_MANUAL_CHOICE_ID,
  defaultPermissionChoiceId,
  paxManualChoice,
  permissionChoiceById,
} from "@/features/permissions/permission-catalog";
import { cn } from "@/lib/utils";

type SessionPermissionSelectorProps = {
  catalog?: AgentPermissionCatalog;
  choices: AgentPermissionChoice[];
  disabled?: boolean;
  error?: boolean;
  loading?: boolean;
  onChange: (choiceId: string) => void;
  value: string;
};

export function SessionPermissionSelector({
  catalog,
  choices,
  disabled,
  error,
  loading,
  onChange,
  value,
}: SessionPermissionSelectorProps) {
  const [pendingConfirmation, setPendingConfirmation] =
    useState<AgentPermissionChoice | null>(null);
  const agentGroupLabelId = useId();
  const shouldExposeManualFallback =
    value === PAX_MANUAL_CHOICE_ID ||
    defaultPermissionChoiceId(choices, "manual", catalog?.default_choice_id) ===
      PAX_MANUAL_CHOICE_ID;
  const menuChoices =
    shouldExposeManualFallback &&
    !choices.some((choice) => choice.choice_id === PAX_MANUAL_CHOICE_ID)
      ? [
          ...choices.filter(
            (choice) => choice.choice_id === PAX_AUTO_APPROVE_CHOICE_ID,
          ),
          paxManualChoice,
          ...choices.filter(
            (choice) => choice.choice_id !== PAX_AUTO_APPROVE_CHOICE_ID,
          ),
        ]
      : choices;
  const paxChoices = menuChoices.filter((choice) => choice.kind === "pax");
  const agentChoices = menuChoices.filter((choice) => choice.kind === "agent");
  const selected = permissionChoiceById(choices, value) ?? {
    choice_id: value,
    kind: value.startsWith("pax:") ? ("pax" as const) : ("agent" as const),
    label: value === PAX_MANUAL_CHOICE_ID ? "Ask before tools" : value,
  };
  const isPaxAuto = selected?.choice_id === PAX_AUTO_APPROVE_CHOICE_ID;

  function select(choice: AgentPermissionChoice) {
    if (choice.choice_id === value) {
      // The displayed manual fallback can mask a stale native selection while
      // another agent's catalog is loading. Commit it even though its effective
      // value already matches what is rendered.
      if (choice.choice_id === PAX_MANUAL_CHOICE_ID) {
        onChange(choice.choice_id);
      }
      return;
    }
    if (choice.requires_confirmation) {
      setPendingConfirmation(choice);
      return;
    }
    onChange(choice.choice_id);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={`Session permissions: ${selected?.label ?? "Choose permissions"}`}
            className={cn(
              "inline-flex min-h-9 max-w-24 shrink-0 items-center gap-1 rounded-lg px-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 sm:max-w-56 sm:gap-2 sm:px-2.5",
              isPaxAuto
                ? "bg-success/10 text-success"
                : "text-primary-hover hover:bg-surface-3",
            )}
            disabled={disabled}
            type="button"
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="truncate whitespace-nowrap text-xs sm:text-sm">
              {selected?.label ?? "Choose permissions"}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-80 max-w-[calc(100vw-24px)]"
        >
          <div aria-label="PAX permissions" role="group">
            {paxChoices.map((choice) => (
              <DropdownMenuItem
                aria-checked={choice.choice_id === value}
                className="items-start"
                key={choice.choice_id}
                onSelect={() => select(choice)}
                role="menuitemradio"
              >
                <Check
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    choice.choice_id === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-ink">
                    <span>{choice.label}</span>
                    {choice.requires_confirmation && (
                      <span className="text-[10px] uppercase tracking-wide text-warning">
                        Confirm
                      </span>
                    )}
                  </span>
                  {choice.description && (
                    <span className="mt-0.5 block text-xs leading-4 text-ink-tertiary">
                      {choice.description}
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
          {agentChoices.length > 0 && (
            <>
              <div
                aria-hidden="true"
                className="mx-2 my-1 border-t border-hairline"
                role="separator"
              />
              <div
                className="mx-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-ink-tertiary"
                id={agentGroupLabelId}
              >
                Agent permissions
              </div>
              <div aria-labelledby={agentGroupLabelId} role="group">
                {agentChoices.map((choice) => (
                  <DropdownMenuItem
                    aria-checked={choice.choice_id === value}
                    className="items-start"
                    key={choice.choice_id}
                    onSelect={() => select(choice)}
                    role="menuitemradio"
                  >
                    <Check
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        choice.choice_id === value
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-ink">
                        <span>{choice.label}</span>
                        {choice.requires_confirmation && (
                          <span className="text-[10px] uppercase tracking-wide text-warning">
                            Confirm
                          </span>
                        )}
                      </span>
                      {choice.description && (
                        <span className="mt-0.5 block text-xs leading-4 text-ink-tertiary">
                          {choice.description}
                        </span>
                      )}
                    </span>
                  </DropdownMenuItem>
                ))}
              </div>
            </>
          )}
          {(loading || error || catalog?.stale) && (
            <div
              className="border-t border-hairline px-2.5 pb-1 pt-2 text-[11px] text-ink-tertiary"
              role="status"
            >
              {loading
                ? "Loading agent permissions…"
                : error
                  ? "Agent permissions are unavailable. Using PAX fallback controls."
                  : `Using cached ${catalog?.source ?? "agent"} permissions while live options are unavailable.`}
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        confirmLabel="Use this permission"
        description={
          pendingConfirmation?.description ??
          "This agent permission can grant broad access to your machine and data."
        }
        onConfirm={() => {
          if (pendingConfirmation) {
            onChange(pendingConfirmation.choice_id);
          }
          setPendingConfirmation(null);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setPendingConfirmation(null);
          }
        }}
        open={Boolean(pendingConfirmation)}
        title={`Use ${pendingConfirmation?.label ?? "this permission"}?`}
      />
    </>
  );
}
