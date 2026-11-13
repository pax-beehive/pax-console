import { AgentSignInPageClient } from "@/components/settings/agent-sign-in-page-client";
import { normalizeAgentType } from "@/components/settings/agent-types";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AgentSignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = await searchParams;
  return (
    <AgentSignInPageClient
      initialNodeId={
        typeof query.node_id === "string" ? query.node_id : undefined
      }
      initialHarness={normalizeAgentType(
        typeof query.harness === "string" ? query.harness : undefined,
      )}
      returnSessionId={
        typeof query.session_id === "string" ? query.session_id : undefined
      }
    />
  );
}
