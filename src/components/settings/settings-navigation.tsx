"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  settingsGroups,
  settingsLinks,
  settingsSectionForPath,
} from "./settings-catalog";

export { settingsLinks } from "./settings-catalog";

export function SettingsSidebar() {
  const pathname = usePathname();
  const selected = settingsSectionForPath(pathname);
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-hairline bg-surface-1">
      <div className="shrink-0 px-4 pb-4 pt-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="h-4 w-4" />}
          className="-ml-2 text-ink-tertiary"
        >
          <Link href="/">Back to workspace</Link>
        </Button>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-xs leading-5 text-ink-tertiary">
          Preferences, access, and tools.
        </p>
      </div>
      <nav
        aria-label="Settings"
        className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 pb-6 pt-1"
      >
        {settingsGroups.map((group) => (
          <div key={group.title}>
            <h3 className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-ink-tertiary">
              {group.title}
            </h3>
            <div className="grid gap-1">
              {group.items.map((item) => {
                const active = selected?.id === item.id;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-w-0 items-start gap-3 rounded-md px-3 py-2.5 transition focus-visible:outline-2 focus-visible:outline-primary",
                      active
                        ? "bg-accent/10 text-ink shadow-[inset_2px_0_0_var(--color-accent)]"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium leading-5">
                        {item.title}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-[11px] leading-4",
                          active ? "text-ink-muted" : "text-ink-tertiary",
                        )}
                      >
                        {item.caption}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

export function SettingsMobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const selected =
    settingsSectionForPath(pathname) ?? settingsGroups[0].items[0];
  return (
    <div className="shrink-0 border-b border-hairline px-4 py-3 lg:hidden">
      <label
        htmlFor="settings-section"
        className="mb-1.5 block text-xs text-ink-tertiary"
      >
        Settings
      </label>
      <div className="relative">
        <select
          id="settings-section"
          aria-label="Settings section"
          value={selected.href}
          onChange={(event) => router.push(event.target.value)}
          className="h-11 w-full appearance-none rounded-md border border-hairline bg-surface-1 px-3 pr-10 text-base text-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          {settingsGroups.map((group) => (
            <optgroup key={group.title} label={group.title}>
              {group.items.map((item) => (
                <option key={item.id} value={item.href}>
                  {item.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-ink-tertiary"
        />
      </div>
    </div>
  );
}

export function SettingsPageHeader({
  title,
  description,
  category,
  children,
}: {
  title: string;
  description: string;
  category?: string;
  children?: ReactNode;
}) {
  return (
    <header className="shrink-0 border-b border-hairline px-5 py-6 sm:px-8 sm:py-7">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 max-w-2xl">
          {category && (
            <p className="mb-2 text-xs font-medium text-ink-tertiary">
              {category}
            </p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-ink-tertiary">
            {description}
          </p>
        </div>
        {children && (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {children}
          </div>
        )}
      </div>
    </header>
  );
}

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
      className="mb-4 inline-flex min-h-9 items-center gap-2 text-sm text-ink-tertiary hover:text-ink lg:hidden"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}
