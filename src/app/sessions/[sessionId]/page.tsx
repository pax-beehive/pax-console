import { SessionPageClient } from "@/components/sessions/session-page-client";

export const dynamic = "force-dynamic";

type SessionPageProps = {
  params: Promise<{
    sessionId: string;
  }>;
  searchParams: Promise<{
    nodeId?: string;
    agentId?: string;
  }>;
};

export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const { sessionId } = await params;
  const { nodeId, agentId } = await searchParams;

  return (
    <SessionPageClient
      agentId={agentId}
      nodeId={nodeId}
      sessionId={sessionId}
    />
  );
}
