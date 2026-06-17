import { ResourceDetailRoute } from "@/components/resources/resource-detail-route";

type AgentDetailPageProps = {
  params: Promise<{
    agentId: string;
  }>;
  searchParams: Promise<{
    nodeId?: string;
  }>;
};

export default async function AgentDetailPage({
  params,
  searchParams,
}: AgentDetailPageProps) {
  const { agentId } = await params;
  const { nodeId } = await searchParams;

  return <ResourceDetailRoute agentId={agentId} kind="agent" nodeId={nodeId} />;
}
