"use client";

import Link from "next/link";
import { Activity, Crosshair, Settings, Users } from "lucide-react";
import { usePathname } from "next/navigation";

const items = [
  {
    href: "/",
    icon: Activity,
    label: "Home",
    matches: ["/", "/sessions", "/inquiries", "/conversations"],
  },
  {
    adminOnly: true,
    href: "/whiteboard",
    icon: Crosshair,
    label: "Whiteboard",
    matches: ["/whiteboard"],
  },
  {
    adminOnly: true,
    href: "/collaboration/teams",
    icon: Users,
    label: "Collaboration",
    matches: ["/collaboration"],
  },
  {
    href: "/settings/devices",
    icon: Settings,
    label: "Settings",
    matches: ["/settings"],
  },
] as const;

export function MobileNav({
  showAdminFeatures,
}: {
  showAdminFeatures: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={`mobile-safe-bottom fixed inset-x-0 bottom-0 z-50 grid h-16 border-t border-hairline bg-surface-1/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden ${
        showAdminFeatures ? "grid-cols-4" : "grid-cols-2"
      }`}
    >
      {items
        .filter((item) => showAdminFeatures || !("adminOnly" in item))
        .map((item) => {
          const active = item.matches.some((path) =>
            path === "/"
              ? pathname === "/"
              : pathname === path || pathname.startsWith(`${path}/`),
          );
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-md text-[11px] transition ${
                active ? "text-accent-bright" : "text-ink-tertiary"
              }`}
              href={item.href}
              key={item.label}
            >
              <item.icon className="h-5 w-5" />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
    </nav>
  );
}
