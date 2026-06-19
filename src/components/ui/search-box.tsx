"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

type SearchBoxProps = {
  className?: string;
  placeholder?: string;
};

export function SearchBox({
  className,
  placeholder = "Search",
}: SearchBoxProps) {
  return (
    <label
      className={cn(
        "flex min-h-8 min-w-0 items-center gap-2 rounded-md border border-hairline bg-surface-1 px-2.5",
        "text-sm text-ink-tertiary focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <input
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-tertiary"
        placeholder={placeholder}
        type="search"
      />
    </label>
  );
}
