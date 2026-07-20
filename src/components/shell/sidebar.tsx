"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  Brain,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  KeyRound,
  MailPlus,
  Radio,
  Server,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaxLogo } from "@/components/ui/pax-logo";
import { Tooltip } from "@/components/ui/tooltip";
import { useConsoleStore } from "@/stores/console-store";

type NavItem = {
  children?: readonly NavItem[];
  href: string;
  icon: LucideIcon;
  label: string;
  matches?: readonly string[];
};

const primaryNavItems: readonly NavItem[] = [
  {
    href: "/",
    icon: Activity,
    label: "Home",
    matches: ["/", "/sessions", "/inquiries", "/conversations"],
  },
  {
    href: "/collaboration/teams",
    icon: Users,
    label: "Collaboration",
    matches: ["/collaboration", "/teams", "/envelopes", "/knowledge"],
    children: [
      { href: "/collaboration/teams", icon: Users, label: "Teams" },
      { href: "/collaboration/friends", icon: MailPlus, label: "Friends" },
      { href: "/collaboration/envelopes", icon: Inbox, label: "Envelopes" },
      { href: "/collaboration/knowledge", icon: Brain, label: "Knowledge" },
    ],
  },
] as const;

const settingsNavItem: NavItem = {
  href: "/settings/devices",
  icon: Settings,
  label: "Settings",
  matches: ["/settings", "/nodes", "/agents", "/approvals", "/monitor"],
  children: [
    { href: "/settings/devices", icon: Server, label: "Devices" },
    { href: "/settings/security", icon: ShieldCheck, label: "Security" },
    { href: "/settings/developer", icon: KeyRound, label: "Developer" },
    { href: "/settings/diagnostics", icon: Radio, label: "Diagnostics" },
  ],
};

export function Sidebar() {
  const collapsed = useConsoleStore((state) => state.sidebarCollapsed);
  const setCollapsed = useConsoleStore((state) => state.setSidebarCollapsed);

  return (
    <aside
      className="flex min-h-screen shrink-0 flex-col overflow-hidden border-r border-hairline bg-surface-1 px-2 py-3 transition-[width] duration-200"
      style={{ width: collapsed ? 76 : 248 }}
    >
      <div
        className={`flex items-center border-b border-hairline px-1 pb-3 ${
          collapsed ? "justify-center px-0" : "gap-3 px-2"
        }`}
      >
        {!collapsed && (
          <Tooltip content="PAX Agent neXus">
            <PaxLogo className="h-[22px] w-[22px] shrink-0 text-ink" />
          </Tooltip>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold leading-tight">
              <span className="text-lg text-accent-bright">P</span>AX{" "}
              <span className="text-lg text-success">A</span>gent ne
              <span className="text-lg text-warning">X</span>us
            </div>
          </div>
        )}
        <Button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={collapsed ? "" : "ml-auto h-7 w-7"}
          icon={
            collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )
          }
          onClick={() => setCollapsed(!collapsed)}
          size="icon"
          tooltip={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
          variant="ghost"
        />
      </div>

      <nav className="mt-3 flex min-h-0 flex-1 flex-col">
        <div className="grid flex-1 content-start gap-0.5 overflow-y-auto">
          {primaryNavItems.map((item) => (
            <NavEntry collapsed={collapsed} item={item} key={item.label} />
          ))}
        </div>
        <div className="mt-2 border-t border-hairline pt-2">
          <NavEntry collapsed={collapsed} item={settingsNavItem} />
        </div>
      </nav>
    </aside>
  );
}

function NavEntry({ collapsed, item }: { collapsed: boolean; item: NavItem }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const expandedGroups = useConsoleStore(
    (state) => state.sidebarExpandedGroups,
  );
  const toggleSidebarGroup = useConsoleStore(
    (state) => state.toggleSidebarGroup,
  );
  const queryString = searchParams.toString();
  const active = isActiveNavItem(pathname, item);
  const groupOpen = expandedGroups[item.label] ?? active;

  return (
    <div className="grid gap-0.5">
      <div className="flex min-w-0 items-center gap-1">
        <Tooltip content={collapsed ? item.label : undefined}>
          <Link
            aria-current={active ? "page" : undefined}
            className={`flex min-h-9 min-w-0 flex-1 items-center gap-3 rounded-md px-3 text-left text-sm transition ${
              collapsed ? "justify-center" : ""
            } ${
              active
                ? "bg-accent/10 text-ink shadow-[inset_2px_0_0_var(--color-accent)] hover:bg-accent/15"
                : "text-ink-subtle hover:bg-surface-2 hover:text-ink"
            }`}
            href={item.href}
          >
            <item.icon
              className={`h-4 w-4 shrink-0 ${active ? "text-accent-bright" : ""}`}
            />
            {!collapsed && (
              <span className="min-w-0 truncate">{item.label}</span>
            )}
          </Link>
        </Tooltip>
        {!collapsed && item.children && (
          <Button
            aria-label={
              groupOpen ? `Collapse ${item.label}` : `Expand ${item.label}`
            }
            className="h-8 w-8"
            icon={
              <ChevronDown
                className={`h-3.5 w-3.5 transition ${
                  groupOpen ? "" : "-rotate-90"
                }`}
              />
            }
            onClick={() => toggleSidebarGroup(item.label)}
            size="icon"
            tooltip={
              groupOpen ? `Collapse ${item.label}` : `Expand ${item.label}`
            }
            type="button"
            variant="ghost"
          />
        )}
      </div>
      {!collapsed && groupOpen && item.children && (
        <div className="ml-5 grid gap-0.5 border-l border-hairline pl-2">
          {item.children.map((child) => (
            <Link
              aria-current={
                isActiveChild(pathname, queryString, child.href)
                  ? "page"
                  : undefined
              }
              className={`flex min-h-8 items-center gap-2 rounded-md px-2 text-xs transition ${
                isActiveChild(pathname, queryString, child.href)
                  ? "bg-accent/10 text-ink shadow-[inset_2px_0_0_var(--color-accent)] hover:bg-accent/15"
                  : "text-ink-tertiary hover:bg-surface-2 hover:text-ink"
              }`}
              href={child.href}
              key={child.href}
            >
              <child.icon
                className={`h-3.5 w-3.5 shrink-0 ${
                  isActiveChild(pathname, queryString, child.href)
                    ? "text-accent-bright"
                    : ""
                }`}
              />
              <span className="min-w-0 truncate">{child.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function isActiveNavItem(pathname: string, item: NavItem) {
  return (item.matches ?? [item.href]).some((href) =>
    isActivePath(pathname, href),
  );
}

function isActiveChild(pathname: string, queryString: string, href: string) {
  const [hrefPath, hrefQuery = ""] = href.split("?");
  if (pathname !== hrefPath) {
    return false;
  }

  if (!hrefQuery) {
    return true;
  }

  const target = new URLSearchParams(hrefQuery);
  const current = new URLSearchParams(queryString);
  for (const [key, value] of target) {
    if (key === "view" && value === "teams" && current.get(key) == null) {
      continue;
    }

    if (current.get(key) !== value) {
      return false;
    }
  }

  return true;
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
