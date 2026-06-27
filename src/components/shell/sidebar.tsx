"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bot,
  Brain,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Inbox,
  KeyRound,
  Radio,
  Server,
  ShieldCheck,
  TerminalSquare,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TruncatedText } from "@/components/ui/text";
import { Tooltip } from "@/components/ui/tooltip";
import { Node } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";

const navItems = [
  ["Home", "/", Activity],
  ["Nodes", "/nodes", Server],
  ["Agents", "/agents", Bot],
  ["Sessions", "/sessions", TerminalSquare],
  ["Teams", "/teams", Users],
  ["Envelopes", "/envelopes", Inbox],
  ["Knowledge", "/knowledge", Brain],
  ["Approvals", "/approvals", ShieldCheck],
  ["Monitor", "/monitor", Radio],
  ["API Keys", "/settings/api-keys", KeyRound],
] as const;

type SidebarProps = {
  activeNode?: Node;
};

export function Sidebar({ activeNode }: SidebarProps) {
  const pathname = usePathname();
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
        {navItems.map(([label, href, Icon]) => (
          <Tooltip content={collapsed ? label : undefined} key={label}>
            <Link
              aria-current={isActivePath(pathname, href) ? "page" : undefined}
              className={`flex min-h-9 items-center gap-3 rounded-md px-3 text-left text-sm transition hover:bg-surface-2 hover:text-ink ${
                collapsed ? "justify-center" : ""
              } ${
                isActivePath(pathname, href)
                  ? "bg-surface-2 text-ink"
                  : "text-ink-subtle"
              }`}
              href={href}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="min-w-0 truncate">{label}</span>}
            </Link>
          </Tooltip>
        ))}
      </nav>
    </aside>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
