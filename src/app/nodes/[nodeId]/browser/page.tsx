import type { Metadata } from "next";
import { DockerBrowserRoute } from "@/components/resources/docker-browser-page";

export const metadata: Metadata = {
  title: "Docker desktop | PAX Console",
};

export default async function DockerBrowserPage({
  params,
}: {
  params: Promise<{ nodeId: string }>;
}) {
  const { nodeId } = await params;
  return <DockerBrowserRoute nodeId={nodeId} />;
}
