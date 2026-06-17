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
  activeAgent,
  children,
}: ConsoleLayoutProps) {
  const sidebarCollapsed = useConsoleStore((state) => state.sidebarCollapsed);

  return (
    <main className="flex min-h-screen bg-canvas text-ink">
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-200"
        style={{ width: sidebarCollapsed ? 76 : 248 }}
      >
        <Sidebar activeNode={activeNode} />
      </div>
      <section className="min-w-0 flex-1">
        <Topbar
          activeAgent={activeAgent}
          activeNode={activeNode}
          nodes={nodes}
          user={user}
        />
        {children}
      </section>
    </main>
  );
}
