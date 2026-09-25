"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SessionHeaderProps = {
  children: ReactNode;
  details?: ReactNode;
  surfaceClassName?: string;
};

export function SessionHeader({
  children,
  details,
  surfaceClassName,
}: SessionHeaderProps) {
  return (
    <header
      className={cn("border-b px-3 py-2 sm:px-4", surfaceClassName)}
      data-testid="session-details-panel"
    >
      <div className="flex min-w-0 items-center gap-2">{children}</div>
      {details && <div className="mt-1.5 min-w-0">{details}</div>}
    </header>
  );
}
