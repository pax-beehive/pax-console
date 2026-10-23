"use client";

import { Search } from "lucide-react";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

type SearchBoxProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "className" | "type"
> & {
  className?: string;
  placeholder?: string;
};

export function SearchBox({
  className,
  placeholder = "Search",
  ...inputProps
}: SearchBoxProps) {
  return (
    <label
      className={cn(
        "flex min-h-8 min-w-0 items-center gap-2 rounded-sm border border-hairline bg-surface-1 px-2.5",
        "text-sm text-ink-tertiary focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <input
        {...inputProps}
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-tertiary"
        placeholder={placeholder}
        type="search"
      />
    </label>
  );
}
