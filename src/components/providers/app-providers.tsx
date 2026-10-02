"use client";

import { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RegionGate } from "@/features/region/region-gate";
import { QueryProvider } from "./query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <TooltipProvider>
        <RegionGate>{children}</RegionGate>
      </TooltipProvider>
    </QueryProvider>
  );
}
