"use client";

import { LocaleProvider } from "@/features/i18n/locale-provider";
import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RegionGate } from "@/features/region/region-gate";
import { QueryProvider } from "./query-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicOverview =
    pathname === "/overview" || pathname === "/zh/overview";
  return (
    <LocaleProvider>
      <QueryProvider>
        <TooltipProvider>
          {isPublicOverview ? children : <RegionGate>{children}</RegionGate>}
        </TooltipProvider>
      </QueryProvider>
    </LocaleProvider>
  );
}
