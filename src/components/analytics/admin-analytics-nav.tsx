"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminAnalyticsNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Customer administration"
      className="flex gap-1 border-b border-hairline pb-2 text-sm"
    >
      {[
        ["/admin/customers", "Customers"],
        ["/admin/notifications", "Push subscriptions"],
      ].map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={`rounded-md px-3 py-2 ${pathname === href ? "bg-surface-2 text-ink" : "text-ink-muted hover:bg-surface-2"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
