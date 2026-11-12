import { AgentSignInPageClient } from "@/components/settings/agent-sign-in-page-client";

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
      initialHarness={query.harness === "codex" ? "codex" : "claude"}
      returnSessionId={
        typeof query.session_id === "string" ? query.session_id : undefined
      }
    />
  );
}
