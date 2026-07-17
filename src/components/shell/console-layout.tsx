"use client";

import { ReactNode } from "react";
import { Agent, Node, User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

type ConsoleLayoutProps = {
  user: User;
  nodes: Node[];
  activeNode?: Node;
  activeAgent?: Agent;
  children: ReactNode;
};

export function ConsoleLayout({
  user,
  nodes,
  activeNode,
  children,
}: ConsoleLayoutProps) {
  const sidebarCollapsed = useConsoleStore((state) => state.sidebarCollapsed);

  return (
    <main className="console-shell flex overflow-hidden bg-canvas text-ink">
      <div
        className="hidden shrink-0 overflow-hidden transition-[width] duration-200 lg:block"
        style={{ width: sidebarCollapsed ? 76 : 248 }}
      >
        <Sidebar />
      </div>
      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar activeNode={activeNode} nodes={nodes} user={user} />
        {children}
      </section>
    </main>
  );
}
