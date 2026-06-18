"use client";

import { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

type TruncatedTextProps = ComponentPropsWithoutRef<"span"> & {
  children: ReactNode;
  tooltip?: ReactNode;
};

export function TruncatedText({
  children,
  className,
  tooltip,
  ...props
}: TruncatedTextProps) {
  const text = typeof children === "string" ? children : undefined;

  return (
    <Tooltip content={tooltip ?? text}>
      <span
        className={cn("block max-w-full min-w-0 truncate", className)}
        title={undefined}
        {...props}
      >
        {children}
      </span>
    </Tooltip>
  );
}

export function MonoId({
  children,
  className,
  tooltip,
}: TruncatedTextProps) {
  return (
    <TruncatedText
      className={cn("font-mono text-xs text-ink-tertiary", className)}
      tooltip={tooltip}
    >
      {children}
    </TruncatedText>
  );
}
