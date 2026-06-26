"use client";

import { ChevronDown, LogOut, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchBox } from "@/components/ui/search-box";
import { TruncatedText } from "@/components/ui/text";
import { LOGOUT_URL } from "@/features/api/client";
import { Agent, Node, User } from "@/features/api/types";

type TopbarProps = {
  user: User;
  nodes: Node[];
  activeNode?: Node;
  activeAgent?: Agent;
};

export function Topbar({ user, nodes, activeNode, activeAgent }: TopbarProps) {
  const router = useRouter();

  return (
    <header className="flex h-[var(--topbar-h)] min-w-0 items-center justify-between gap-4 border-b border-hairline bg-canvas/95 px-4 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          className="max-w-52"
          size="sm"
          tooltip={
            activeNode?.name ?? activeNode?.hostname ?? `${nodes.length} nodes`
          }
          type="button"
          variant="secondary"
        >
          {activeNode?.name ?? activeNode?.hostname ?? `${nodes.length} nodes`}
        </Button>
        <SearchBox
          className="w-full max-w-[340px]"
          placeholder="Search threads and resources"
        />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="hidden min-w-0 items-center gap-2 rounded-lg border border-transparent px-2 py-1 text-left transition hover:border-hairline hover:bg-surface-1 data-[state=open]:border-hairline data-[state=open]:bg-surface-1 sm:flex"
              type="button"
            >
              <span className="min-w-0">
                <span className="block text-xs text-ink-tertiary">
                  Signed in
                </span>
                <TruncatedText className="block max-w-44 text-sm text-ink-muted">
                  {user.email ?? user.name ?? user.user_id}
                </TruncatedText>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-ink-tertiary" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onSelect={() => {
                window.location.assign(LOGOUT_URL);
              }}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          className="max-w-36"
          disabled={!activeNode || !activeAgent}
          icon={<Plus className="h-3.5 w-3.5 shrink-0" />}
          onClick={() => {
            if (!activeNode || !activeAgent) {
              return;
            }

            router.push(
              `/sessions/new?nodeId=${activeNode.node_id}&agentId=${activeAgent.agent_id}`,
            );
          }}
          size="sm"
          tooltip={
            activeNode && activeAgent
              ? "New session"
              : "Select a node and agent before creating a session"
          }
          type="button"
          variant="primary"
        >
          New session
        </Button>
      </div>
    </header>
  );
}
