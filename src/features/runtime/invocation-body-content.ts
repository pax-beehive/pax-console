import type { AgentOwnerInfo } from "@/features/api/types";
import type { SessionEvent } from "./session-events";

export function readableInvocationContent(
  content: string,
  ownerInfos: Record<string, AgentOwnerInfo>,
) {
  let readable = content;
  for (const [agentId, ownerInfo] of Object.entries(ownerInfos)) {
    const agentName = ownerInfo.profile?.display_name ?? ownerInfo.agent.name;
    if (!agentName) {
      continue;
    }

    readable = readable.replaceAll(agentId, agentName);
  }

  return readable;
}

export function invocationBodyContent(
  event: Extract<SessionEvent, { type: "invocation" }>,
  ownerInfos: Record<string, AgentOwnerInfo>,
) {
  const readable = readableInvocationContent(event.content, ownerInfos);
  if (readable.trim() && !isGenericInvocationDisplayText(readable)) {
    return readable;
  }

  return event.originalContent?.trim() || undefined;
}

function isGenericInvocationDisplayText(content: string) {
  return (
    /^Received a Pax conversation (reply|inquiry) from .+\.$/.test(content) ||
    /^Asked .+ for input\.$/.test(content)
  );
}
