"use client";

import { useCallback, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConsoleLayout } from "@/components/shell/console-layout";
import { Button } from "@/components/ui/button";
import {
  artifactContentDownloadHref,
  artifactPublicationContentDownloadHref,
  getArtifactContentURL,
  getArtifactPublicationContent,
  useArtifact,
  useArtifactPublication,
} from "@/features/api/resources";
import type { User } from "@/features/api/types";
import { AuthGate } from "@/features/auth/auth-gate";
import { useDocumentTitle } from "@/lib/use-document-title";
import {
  type ArtifactDocument,
  artifactDocumentFromPublication,
  artifactDocumentFromSessionArtifact,
  primaryArtifactContent,
} from "./artifact-document";
import { ArtifactViewerShell } from "./artifact-viewer-shell";

export type ArtifactPreviewRouteSource = "publications" | "files";

type ArtifactPreviewRouteProps = {
  artifactId: string;
  contentRef: string;
  sourceType: ArtifactPreviewRouteSource;
};

export function ArtifactPreviewRoute(props: ArtifactPreviewRouteProps) {
  return (
    <AuthGate>
      {(user) => <ArtifactPreviewPage {...props} user={user} />}
    </AuthGate>
  );
}

function ArtifactPreviewPage({
  artifactId,
  contentRef,
  sourceType,
  user,
}: ArtifactPreviewRouteProps & { user: User }) {
  const router = useRouter();
  const publicationQuery = useArtifactPublication(
    sourceType === "publications" ? user.user_id : undefined,
    sourceType === "publications" ? artifactId : undefined,
  );
  const artifactQuery = useArtifact(
    sourceType === "files" ? user.user_id : undefined,
    sourceType === "files" ? artifactId : undefined,
  );
  const sessionArtifact = artifactQuery.data?.artifact;
  const content = primaryArtifactContent(sessionArtifact, contentRef);
  const document = useMemo<ArtifactDocument>(() => {
    if (sourceType === "publications") {
      return artifactDocumentFromPublication({
        contentRef,
        downloadHref: artifactPublicationContentDownloadHref(
          user.user_id,
          artifactId,
          contentRef,
        ),
        fallbackTitle: publicationQuery.data
          ? "Untitled artifact"
          : "Loading artifact…",
        publicationId: artifactId,
        state: publicationQuery.data,
      });
    }

    if (!sessionArtifact) {
      return {
        id: artifactId,
        sourceType: "session_artifact",
        previewMode: "document",
        title: artifactQuery.isError
          ? "Artifact unavailable"
          : "Loading artifact…",
        status: artifactQuery.isError ? "failed" : "loading",
        statusMessage:
          artifactQuery.error instanceof Error
            ? artifactQuery.error.message
            : undefined,
      };
    }

    return artifactDocumentFromSessionArtifact(
      sessionArtifact,
      artifactContentDownloadHref(
        user.user_id,
        artifactId,
        content?.ref ?? contentRef,
      ),
      contentRef,
    );
  }, [
    artifactId,
    artifactQuery.error,
    artifactQuery.isError,
    content?.ref,
    contentRef,
    publicationQuery.data,
    sessionArtifact,
    sourceType,
    user.user_id,
  ]);
  useDocumentTitle(`${document.title} · Artifact`);

  const loadPreview = useCallback(async () => {
    if (sourceType === "publications") {
      const data = await getArtifactPublicationContent(
        user.user_id,
        artifactId,
        contentRef,
        { disposition: "inline" },
      );
      if (data.status !== "available" || !data.url) {
        throw new Error(
          data.status === "failed"
            ? data.publication.error_message || "Artifact preview failed."
            : "Artifact preview is not ready yet.",
        );
      }
      return {
        contentType: data.content?.content_type,
        filename: data.content?.filename,
        previewKind: data.preview_kind,
        url: data.url,
      };
    }

    if (!sessionArtifact || !content) {
      throw new Error("Artifact content is not available.");
    }
    const data = await getArtifactContentURL(
      user.user_id,
      sessionArtifact.artifact_id,
      content.ref,
      "inline",
    );
    return {
      contentType: data.content.content_type,
      filename: data.content.filename,
      url: data.url,
    };
  }, [
    artifactId,
    content,
    contentRef,
    sessionArtifact,
    sourceType,
    user.user_id,
  ]);

  const queryError =
    sourceType === "publications"
      ? publicationQuery.error
      : artifactQuery.error;

  return (
    <ConsoleLayout user={user}>
      <div className="flex min-h-0 flex-1 flex-col bg-canvas">
        <ArtifactViewerShell
          artifact={document}
          autoLoad
          className="min-h-0 flex-1 rounded-none border-x-0 border-b-0"
          error={queryError instanceof Error ? queryError : undefined}
          key={`${sourceType}:${artifactId}:${contentRef}`}
          loadPreview={loadPreview}
          standalone
          navigation={
            document.sessionId ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                aria-label="Back to session"
                tooltip="Back to session"
                className="max-sm:h-9 max-sm:w-9 max-sm:justify-center max-sm:px-0"
              >
                <Link
                  href={`/?session_id=${encodeURIComponent(document.sessionId)}`}
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Back to session</span>
                </Link>
              </Button>
            ) : (
              <Button
                icon={<ArrowLeft className="h-4 w-4" />}
                onClick={() => router.back()}
                variant="ghost"
              >
                Back
              </Button>
            )
          }
        />
      </div>
    </ConsoleLayout>
  );
}
