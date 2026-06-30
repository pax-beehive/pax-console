"use client";

import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/auth-gate";
import { SessionWorkbench } from "./session-workbench";

type SessionPageClientProps = {
  sessionId: string;
  nodeId?: string;
  agentId?: string;
};

export function SessionPageClient({
  sessionId,
  nodeId,
  agentId,
}: SessionPageClientProps) {
  const searchParams = useSearchParams();
  const resolvedAgentId = agentId ?? searchParams.get("agentId") ?? undefined;
  const resolvedNodeId = nodeId ?? searchParams.get("nodeId") ?? undefined;
  const newSessionNonce = searchParams.get("nonce") ?? "";

  return (
    <AuthGate>
      {(user) => (
        <SessionWorkbench
          agentId={resolvedAgentId}
          key={`${sessionId}:${resolvedNodeId ?? ""}:${resolvedAgentId ?? ""}:${newSessionNonce}`}
          nodeId={resolvedNodeId}
          sessionId={sessionId}
          user={user}
        />
      )}
    </AuthGate>
  );
}
