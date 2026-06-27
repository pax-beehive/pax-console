"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  Bot,
  Brain,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Inbox,
  KeyRound,
  MailPlus,
  Radio,
  Server,
  ShieldCheck,
  TerminalSquare,
  Users,
} from "lucide-react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/text";
import { Tooltip } from "@/components/ui/tooltip";
import { Node } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";

type NavItem = {
  children?: readonly NavItem[];
  href: string;
  icon: LucideIcon;
  label: string;
  matches?: readonly string[];
};

const navItems: readonly NavItem[] = [
  { href: "/", icon: Activity, label: "Home" },
  {
    href: "/nodes",
    icon: Server,
    label: "Runtime",
    matches: ["/nodes", "/agents", "/sessions", "/approvals", "/monitor"],
    children: [
      { href: "/nodes", icon: Server, label: "Nodes" },
      { href: "/agents", icon: Bot, label: "Agents" },
      { href: "/sessions", icon: TerminalSquare, label: "Sessions" },
      { href: "/approvals", icon: ShieldCheck, label: "Approvals" },
      { href: "/monitor", icon: Radio, label: "Monitor" },
    ],
  },
  {
    href: "/teams?view=teams",
    icon: Users,
    label: "Collaboration",
    matches: ["/teams", "/envelopes", "/knowledge"],
    children: [
      { href: "/teams?view=teams", icon: Users, label: "Teams" },
      { href: "/teams?view=friends", icon: MailPlus, label: "Friends" },
      { href: "/envelopes", icon: Inbox, label: "Envelopes" },
      { href: "/knowledge", icon: Brain, label: "Knowledge" },
    ],
  },
  { href: "/settings/api-keys", icon: KeyRound, label: "API Keys" },
] as const;

type SidebarProps = {
  activeNode?: Node;
};

export function Sidebar({ activeNode }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const collapsed = useConsoleStore((state) => state.sidebarCollapsed);
  const expandedGroups = useConsoleStore((state) => state.sidebarExpandedGroups);
  const setCollapsed = useConsoleStore((state) => state.setSidebarCollapsed);
  const toggleSidebarGroup = useConsoleStore((state) => state.toggleSidebarGroup);
  const queryString = searchParams.toString();

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
          <Tooltip content="PAX Agent workspace">
            <div className="h-[18px] w-[18px] shrink-0 rounded-[5px] border border-hairline-strong bg-canvas" />
          </Tooltip>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">PAX</div>
            <div className="mt-0.5 truncate text-xs text-ink-tertiary">
              Agent workspace
            </div>
          </div>
        )}
        <Button
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={collapsed ? "" : "ml-auto"}
          icon={
            collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )
          }
          onClick={() => setCollapsed(!collapsed)}
          size="icon"
          tooltip={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
          variant="ghost"
        />
      </div>

      <div
        className={`mt-3 border-b border-hairline ${
          collapsed ? "flex h-12 items-center justify-center p-0" : "px-3 pb-3 pt-1"
        }`}
      >
        {!collapsed && (
          <div className="text-[11px] text-ink-tertiary">Current node</div>
        )}
        <div
          className={`flex min-w-0 items-center justify-between gap-3 ${
            collapsed ? "" : "mt-1"
          }`}
        >
          {!collapsed && (
            <TruncatedText className="text-sm font-medium">
              {activeNode?.name ?? activeNode?.hostname ?? "No node selected"}
            </TruncatedText>
          )}
          <Tooltip
            content={
              activeNode
                ? `${activeNode.name ?? activeNode.hostname ?? activeNode.node_id}: ${
                    activeNode.online ? "online" : "offline"
                  }`
                : "No node selected"
            }
          >
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-subtle">
              <CircleDot
                className={`h-3 w-3 ${
                  activeNode?.online ? "text-success" : "text-ink-tertiary"
                }`}
              />
              {!collapsed && activeNode && (
                <span>{activeNode.online ? "online" : "offline"}</span>
              )}
            </span>
          </Tooltip>
        </div>
      </div>

      <nav className="mt-3 grid gap-0.5">
        {navItems.map((item) => {
          const active = isActiveNavItem(pathname, item);
          const groupOpen = expandedGroups[item.label] ?? active;
          return (
            <div className="grid gap-0.5" key={item.label}>
              <div className="flex min-w-0 items-center gap-1">
                <Tooltip content={collapsed ? item.label : undefined}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-9 min-w-0 flex-1 items-center gap-3 rounded-md px-3 text-left text-sm transition hover:bg-surface-2 hover:text-ink ${
                      collapsed ? "justify-center" : ""
                    } ${active ? "bg-surface-2 text-ink" : "text-ink-subtle"}`}
                    href={item.href}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!collapsed && (
                      <span className="min-w-0 truncate">{item.label}</span>
                    )}
                  </Link>
                </Tooltip>
                {!collapsed && item.children && (
                  <Button
                    aria-label={
                      groupOpen
                        ? `Collapse ${item.label}`
                        : `Expand ${item.label}`
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
                      groupOpen
                        ? `Collapse ${item.label}`
                        : `Expand ${item.label}`
                    }
                    type="button"
                    variant="ghost"
                  />
                )}
              </div>
              {!collapsed && active && groupOpen && item.children && (
                <div className="ml-5 grid gap-0.5 border-l border-hairline pl-2">
                  {item.children.map((child) => (
                    <Link
                      aria-current={
                        isActiveChild(pathname, queryString, child.href)
                          ? "page"
                          : undefined
                      }
                      className={`flex min-h-8 items-center gap-2 rounded-md px-2 text-xs transition hover:bg-surface-2 hover:text-ink ${
                        isActiveChild(pathname, queryString, child.href)
                          ? "bg-surface-2 text-ink"
                          : "text-ink-tertiary"
                      }`}
                      href={child.href}
                      key={child.href}
                    >
                      <child.icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 truncate">{child.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
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
