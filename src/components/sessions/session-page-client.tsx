"use client";

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
  return (
    <AuthGate>
      {(user) => (
        <SessionWorkbench
          agentId={agentId}
          nodeId={nodeId}
          sessionId={sessionId}
          user={user}
        />
      )}
    </AuthGate>
  );
}
