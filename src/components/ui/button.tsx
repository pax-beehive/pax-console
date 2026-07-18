"use client";

import { Slot } from "@radix-ui/react-slot";
import { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  asChild?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md" | "icon";
  tooltip?: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

const variants = {
  primary:
    "border-primary bg-primary text-canvas hover:bg-primary-hover disabled:border-hairline disabled:bg-surface-2 disabled:text-ink-tertiary",
  secondary:
    "border-hairline bg-surface-1 text-ink-muted hover:border-hairline-strong hover:bg-surface-2 hover:text-ink",
  ghost:
    "border-transparent bg-transparent text-ink-subtle hover:bg-surface-2 hover:text-ink",
  danger:
    "border-hairline bg-surface-1 text-ink-muted hover:border-warning hover:text-ink",
};

const sizes = {
  sm: "min-h-8 px-2.5 text-xs",
  md: "min-h-9 px-3 text-sm",
  icon: "h-9 w-9 justify-center px-0",
};

export function Button({
  asChild,
  children,
  className,
  icon,
  size = "md",
  tooltip,
  variant = "secondary",
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const button = (
    <Comp
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-2 rounded-md border font-medium transition",
        "disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children && <span className="min-w-0 truncate">{children}</span>}
    </Comp>
  );

  return <Tooltip content={tooltip}>{button}</Tooltip>;
}
