"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MobileCollapsibleSessionHeaderProps = {
  children: ReactNode;
  actions?: ReactNode;
  summary: ReactNode;
  surfaceClassName?: string;
};

export function MobileCollapsibleSessionHeader({
  children,
  actions,
  summary,
  surfaceClassName,
}: MobileCollapsibleSessionHeaderProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const panelId = useId();

  const collapseButton = (
    <Button
      aria-controls={panelId}
      aria-expanded={mobileExpanded}
      aria-label="Collapse session details"
      className="col-start-2 row-start-1 lg:hidden"
      icon={<ChevronUp className="h-4 w-4" />}
      onClick={() => setMobileExpanded(false)}
      size="icon"
      tooltip="Collapse session details"
      type="button"
      variant="ghost"
    />
  );

  return (
    <>
      <div
        className={cn(
          "min-h-11 items-center border-b px-3 transition-[background-color,border-color] duration-500 lg:hidden",
          mobileExpanded ? "hidden" : "flex",
          surfaceClassName,
        )}
      >
        <button
          aria-controls={panelId}
          aria-expanded={mobileExpanded}
          aria-label="Expand session details"
          className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 text-left"
          onClick={() => setMobileExpanded(true)}
          type="button"
        >
          <span className="min-w-0 flex-1">{summary}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-ink-tertiary" />
        </button>
        {actions}
      </div>

      <div
        className={cn(
          "grid-cols-[minmax(0,1fr)_auto] items-center justify-between gap-2 border-b px-3 py-2 transition-[background-color,border-color] duration-500 sm:gap-4 sm:px-4 sm:py-3 lg:flex",
          mobileExpanded ? "grid" : "hidden",
          surfaceClassName,
        )}
        data-mobile-expanded={mobileExpanded ? "true" : "false"}
        data-testid="session-details-panel"
        id={panelId}
      >
        {children}
        {collapseButton}
      </div>
    </>
  );
}
