"use client";

import { ReactNode, useRef } from "react";
import { usePathname } from "next/navigation";
import { useConsoleViewport } from "@/lib/use-console-viewport";
import { User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import { canSeeAdminFeatures } from "@/features/auth/admin-view";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileNav } from "./mobile-nav";
import { CustomerVisitTracker } from "@/features/analytics/use-customer-analytics";
import { NotificationLifecycle } from "@/features/notifications/notification-lifecycle";
import { isSettingsRoute } from "@/components/settings/settings-catalog";
import { SettingsMobileNav } from "@/components/settings/settings-navigation";

type ConsoleLayoutProps = {
  user: User;
  children: ReactNode;
};

export function ConsoleLayout({ user, children }: ConsoleLayoutProps) {
  const settingsMode = isSettingsRoute(usePathname());
  const shellRef = useRef<HTMLElement>(null);
  useConsoleViewport(shellRef);
  const sidebarCollapsed = useConsoleStore((state) => state.sidebarCollapsed);
  const previewAsUser = useConsoleStore((state) => state.previewAsUser);
  const showAdminFeatures = canSeeAdminFeatures(user, previewAsUser);

  return (
    <main
      ref={shellRef}
      className="console-shell flex overflow-hidden bg-canvas text-ink"
    >
      <CustomerVisitTracker userId={user.user_id} />
      <NotificationLifecycle userId={user.user_id} />
      <div
        className="hidden shrink-0 overflow-hidden transition-[width] duration-200 lg:block"
        style={{ width: settingsMode ? 272 : sidebarCollapsed ? 76 : 248 }}
      >
        <Sidebar showAdminFeatures={showAdminFeatures} />
      </div>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[var(--console-mobile-nav-height)] lg:pb-0">
        <Topbar user={user} />
        {settingsMode && <SettingsMobileNav />}
        {children}
      </section>
      <MobileNav showAdminFeatures={showAdminFeatures} />
    </main>
  );
}
