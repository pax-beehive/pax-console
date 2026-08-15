"use client";

import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/features/auth/auth-gate";
import { SessionApprovalMode } from "@/features/api/types";
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
  const initialPrompt = searchParams.get("prompt") ?? undefined;
  const initialPromptKey = searchParams.get("promptKey") ?? undefined;
  const initialSessionCwd = searchParams.get("cwd") ?? undefined;
  const approvalMode = searchParams.get("approvalMode");
  const initialPermissionChoiceId =
    searchParams.get("permissionChoiceId") ?? undefined;
  const initialApprovalMode: SessionApprovalMode | undefined =
    approvalMode === "manual" || approvalMode === "auto_approve_all"
      ? approvalMode
      : undefined;

  return (
    <AuthGate>
      {(user) => (
        <SessionWorkbench
          agentId={resolvedAgentId}
          key={`${sessionId}:${resolvedNodeId ?? ""}:${resolvedAgentId ?? ""}:${newSessionNonce}:${initialPromptKey ?? ""}:${initialSessionCwd ?? ""}:${initialApprovalMode ?? ""}:${initialPermissionChoiceId ?? ""}`}
          initialApprovalMode={initialApprovalMode}
          initialCwd={initialSessionCwd}
          initialPrompt={initialPrompt}
          initialPromptKey={initialPromptKey}
          initialPermissionChoiceId={initialPermissionChoiceId}
          nodeId={resolvedNodeId}
          sessionId={sessionId}
          user={user}
        />
      )}
    </AuthGate>
  );
}
