"use client";

import { ReactNode } from "react";
import { User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";

type ConsoleLayoutProps = {
  user: User;
  children: ReactNode;
};

export function ConsoleLayout({ user, children }: ConsoleLayoutProps) {
  const sidebarCollapsed = useConsoleStore((state) => state.sidebarCollapsed);
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const showAdminFeatures = canSeeAdminFeatures(user, previewAsUser);

  return (
    <main className="console-shell flex overflow-hidden bg-canvas text-ink">
      <div
        className="hidden shrink-0 overflow-hidden transition-[width] duration-200 lg:block"
        style={{ width: sidebarCollapsed ? 76 : 248 }}
      >
        <Sidebar showAdminFeatures={showAdminFeatures} />
      </div>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-16 lg:pb-0">
        <Topbar user={user} />
        {children}
      </section>
      <MobileNav showAdminFeatures={showAdminFeatures} />
    </main>
  );
}
