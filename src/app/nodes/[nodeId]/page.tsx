import { ResourceDetailRoute } from "@/components/resources/resource-detail-route";

type NodeDetailPageProps = {
  params: Promise<{
    nodeId: string;
  }>;
};

export default async function NodeDetailPage({ params }: NodeDetailPageProps) {
  const { nodeId } = await params;

  return <ResourceDetailRoute kind="node" nodeId={nodeId} />;
}
