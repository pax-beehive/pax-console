import { AddDevicePage } from "@/components/settings/add-device-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ nodeId?: string | string[] }>;
}) {
  const { nodeId } = await searchParams;
  return (
    <AddDevicePage
      intent="agent"
      nodeId={typeof nodeId === "string" ? nodeId : undefined}
    />
  );
}
