"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RegionGate } from "@/features/region/region-gate";
import { QueryProvider } from "./query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  const isPublicOverview = usePathname() === "/overview";
  return (
    <QueryProvider>
      <TooltipProvider>
        {isPublicOverview ? children : <RegionGate>{children}</RegionGate>}
      </TooltipProvider>
    </QueryProvider>
  );
}
