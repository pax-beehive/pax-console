"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export const settingsLinks = {
  home: "/settings",
  devices: "/settings/devices",
  projects: "/settings/projects",
  status: "/settings/service-status",
  advanced: "/settings/advanced",
  permissions: "/settings/advanced/permissions",
  encryption: "/settings/advanced/encryption",
  apiKeys: "/settings/advanced/api-keys",
  registration: "/settings/advanced/node-registration",
  addDevice: "/settings/devices/add",
} as const;

export function SettingsBack({
  href = settingsLinks.home,
  label = "Settings",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm text-ink-tertiary hover:text-ink"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function SettingsLink({
  href,
  title,
  description,
  icon: Icon,
  trailing,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-3 border-b border-hairline px-4 py-5 text-left transition last:border-b-0 hover:bg-surface-2 focus-visible:outline-primary"
    >
      <Icon className="h-5 w-5 shrink-0 text-accent-bright" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="mt-1 block text-xs text-ink-tertiary">
          {description}
        </span>
      </span>
      {trailing}
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-tertiary" />
    </Link>
  );
}

export function SettingsGroup({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
      {children}
    </div>
  );
}
