"use client";

import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Switch } from "./switch";
import { Tooltip } from "./tooltip";
import { cn } from "@/lib/utils";

const rowClass =
  "flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm transition hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-focus disabled:cursor-not-allowed disabled:opacity-45";

export function SettingsRow({
  label,
  value,
  disabled,
  onClick,
  ariaLabel,
  tooltip,
}: {
  label: string;
  value?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel?: string;
  tooltip?: string;
}) {
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onClick}
        className={rowClass}
      >
        <span className="min-w-0 flex-1 text-ink">{label}</span>
        <span className="max-w-[55%] truncate text-ink-muted">{value}</span>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-ink-tertiary"
        />
      </button>
    </Tooltip>
  );
}

export function SettingsChoices({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid gap-1"
      onKeyDown={(event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
          return;
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="radio"]:not(:disabled)',
          ),
        );
        const index = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (!items.length || index < 0) return;
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
                items.length;
        items[next].focus();
      }}
    >
      {children}
    </div>
  );
}

export function SettingsChoice({
  label,
  description,
  truncateDescription,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  description?: string;
  truncateDescription?: boolean;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(rowClass, "items-start", selected && "bg-surface-3")}
    >
      <span className="min-w-0 flex-1">
        <span className="block break-words text-ink">{label}</span>
        {description && (
          <span
            className={cn(
              "mt-1.5 block text-xs leading-5 text-ink-muted",
              truncateDescription && "truncate",
            )}
          >
            {description}
          </span>
        )}
      </span>
      <Check
        aria-hidden="true"
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 text-primary-hover",
          !selected && "invisible",
        )}
      />
    </button>
  );
}

export function SettingsToggle({
  label,
  description,
  truncateDescription,
  ariaLabel,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  truncateDescription?: boolean;
  ariaLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl px-3 py-3.5 text-sm">
      <span className="min-w-0">
        <span className="block text-ink">{label}</span>
        {description && (
          <span
            className={cn(
              "mt-1.5 block text-xs leading-5 text-ink-muted",
              truncateDescription && "truncate",
            )}
          >
            {description}
          </span>
        )}
      </span>
      <Switch
        aria-label={ariaLabel ?? label}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </label>
  );
}
