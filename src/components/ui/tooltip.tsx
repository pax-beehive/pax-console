"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={100}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  children,
  content,
  openOnClick = false,
}: {
  children: ReactNode;
  content?: ReactNode;
  openOnClick?: boolean;
}) {
  if (!content) {
    return children;
  }

  return (
    <TooltipWithContent content={content} openOnClick={openOnClick}>
      {children}
    </TooltipWithContent>
  );
}

function TooltipWithContent({
  children,
  content,
  openOnClick,
}: {
  children: ReactNode;
  content: ReactNode;
  openOnClick: boolean;
}) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    },
    [],
  );

  function showClickTooltip() {
    if (!openOnClick) {
      return;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
    }
    setOpen(true);
    closeTimerRef.current = setTimeout(() => setOpen(false), 1800);
  }

  return (
    <TooltipPrimitive.Root
      onOpenChange={openOnClick ? setOpen : undefined}
      open={openOnClick ? open : undefined}
    >
      <TooltipPrimitive.Trigger
        asChild
        onClick={openOnClick ? showClickTooltip : undefined}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className={cn(
            "z-50 w-max max-w-[min(80vw,48rem)] rounded-md border border-hairline bg-surface-3 px-2.5 py-1.5",
            "[overflow-wrap:anywhere]",
            "text-xs leading-5 text-ink-muted shadow-xl shadow-black/30",
          )}
          sideOffset={8}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-surface-3" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
