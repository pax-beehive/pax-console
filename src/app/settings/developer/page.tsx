import { ResourceRoute } from "@/components/resources/resource-route";

type DeveloperPageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function DeveloperPage({
  searchParams,
}: DeveloperPageProps) {
  const { view } = await searchParams;
  return (
    <ResourceRoute
      kind={view === "node-registration" ? "node-registration" : "api-keys"}
    />
  );
}
