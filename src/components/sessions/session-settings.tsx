"use client";
import { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
export function SessionSettings({
  children,
  summary,
}: {
  children: ReactNode;
  summary: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label="Session settings"
          variant="ghost"
          size="sm"
          type="button"
          className="min-w-0 max-w-64 shrink"
          icon={<SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />}
        >
          <span className="truncate text-xs">{summary}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top">
        <div className="mb-3 text-sm font-medium">Session settings</div>
        <div className="grid gap-3">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
