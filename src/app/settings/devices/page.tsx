import { ResourceRoute } from "@/components/resources/resource-route";

type DevicesPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function DevicesPage({ searchParams }: DevicesPageProps) {
  const { view } = await searchParams;
  return <ResourceRoute kind={view === "agents" ? "agents" : "nodes"} />;
}
