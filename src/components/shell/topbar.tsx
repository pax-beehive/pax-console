"use client";

import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { TruncatedText } from "@/components/ui/text";
import { createAgentSession } from "@/features/api/resources";
import { Agent, Node, User } from "@/features/api/types";

type TopbarProps = {
  user: User;
  nodes: Node[];
  activeNode?: Node;
  activeAgent?: Agent;
};

export function Topbar({ user, nodes, activeNode, activeAgent }: TopbarProps) {
  const router = useRouter();
  const createSession = useMutation({
    mutationFn: () => {
      if (!activeNode || !activeAgent) {
        throw new Error("Select a node and agent before creating a session");
      }

      return createAgentSession(
        user.user_id,
        activeNode.node_id,
        activeAgent.agent_id,
      );
    },
    onSuccess: (session) => {
      router.push(
        `/sessions/${session.session_id}?nodeId=${session.node_id}&agentId=${session.agent_id}`,
      );
    },
  });

  return (
    <header className="flex h-14 min-w-0 items-center justify-between gap-4 border-b border-hairline bg-canvas/90 px-5 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button
          className="max-w-52"
          tooltip={activeNode?.name ?? activeNode?.hostname ?? `${nodes.length} nodes`}
          type="button"
          variant="secondary"
        >
          {activeNode?.name ?? activeNode?.hostname ?? `${nodes.length} nodes`}
        </Button>
        <SearchBox
          className="w-full max-w-[360px]"
          placeholder="Search agents, sessions, tool calls"
        />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="text-xs text-ink-tertiary">Signed in</div>
          <TruncatedText className="max-w-44 text-sm text-ink-muted">
            {user.email ?? user.name ?? user.user_id}
          </TruncatedText>
        </div>
        <Button
          className="max-w-36"
          disabled={!activeNode || !activeAgent || createSession.isPending}
          icon={<Plus className="h-4 w-4 shrink-0" />}
          onClick={() => createSession.mutate()}
          tooltip={
            activeNode && activeAgent
              ? "New session"
              : "Select a node and agent before creating a session"
          }
          type="button"
          variant="primary"
        >
          {createSession.isPending ? "Creating..." : "New session"}
        </Button>
      </div>
    </header>
  );
}
