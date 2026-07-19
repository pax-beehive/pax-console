"use client";

import { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

type BadgeProps = ComponentPropsWithoutRef<"span"> & {
  children: ReactNode;
  tooltip?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
};

const tones = {
  neutral: "border-hairline bg-surface-2 text-ink-subtle",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  accent: "border-accent/30 bg-accent/10 text-accent-bright",
};

export function Badge({
  children,
  className,
  tone = "neutral",
  tooltip,
  ...props
}: BadgeProps) {
  const text = typeof children === "string" ? children : undefined;

  return (
    <Tooltip content={tooltip ?? text}>
      <span
        className={cn(
          "inline-flex max-w-32 shrink-0 items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-xs leading-5",
          tones[tone],
          className,
        )}
        {...props}
      >
        <span className="min-w-0 truncate">{children}</span>
      </span>
    </Tooltip>
  );
}
