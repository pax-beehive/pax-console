import { notFound } from "next/navigation";
import { ArtifactPreviewRoute } from "@/components/artifacts/artifact-preview-page";

export const dynamic = "force-dynamic";

type ArtifactPreviewPageProps = {
  params: Promise<{
    artifactId: string;
    sourceType: string;
  }>;
  searchParams: Promise<{
    ref?: string | string[];
  }>;
};

export default async function ArtifactPreviewPage({
  params,
  searchParams,
}: ArtifactPreviewPageProps) {
  const [{ artifactId, sourceType }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  if (sourceType !== "publications" && sourceType !== "files") {
    notFound();
  }

  const contentRef = Array.isArray(query.ref) ? query.ref[0] : query.ref;

  return (
    <ArtifactPreviewRoute
      artifactId={artifactId}
      contentRef={contentRef || "main"}
      sourceType={sourceType}
    />
  );
}
