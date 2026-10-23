"use client";

import { useCallback } from "react";
import {
  artifactPublicationContentDownloadHref,
  getArtifactPublicationContent,
  useArtifactPublication,
} from "@/features/api/resources";
import {
  artifactDocumentFromPublication,
  artifactPreviewPageHref,
} from "./artifact-document";
import { ArtifactViewerShell } from "./artifact-viewer-shell";

type PublicationArtifactViewerProps = {
  allowFullscreen?: boolean;
  autoLoad?: boolean;
  className?: string;
  contentRef?: string;
  fallbackTitle?: string;
  publicationId: string;
  previewScope?: string;
  userId?: string;
};

/** ArtifactViewerShell bound to an artifact publication (agent publish or user fetch). */
export function PublicationArtifactViewer({
  allowFullscreen,
  autoLoad,
  className,
  contentRef = "main",
  fallbackTitle,
  publicationId,
  previewScope,
  userId,
}: PublicationArtifactViewerProps) {
  const publicationQuery = useArtifactPublication(userId, publicationId);
  const artifact = artifactDocumentFromPublication({
    contentRef,
    downloadHref: userId
      ? artifactPublicationContentDownloadHref(
          userId,
          publicationId,
          contentRef,
        )
      : undefined,
    fallbackTitle: fallbackTitle ?? publicationId,
    publicationId,
    state: publicationQuery.data,
  });

  const loadPreview = useCallback(async () => {
    if (!userId) {
      throw new Error("Sign in to preview this artifact.");
    }

    const data = await getArtifactPublicationContent(
      userId,
      publicationId,
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
  }, [contentRef, publicationId, userId]);

  return (
    <ArtifactViewerShell
      allowFullscreen={allowFullscreen}
      artifact={artifact}
      autoLoad={autoLoad}
      className={className}
      error={
        publicationQuery.error instanceof Error
          ? publicationQuery.error
          : undefined
      }
      loadPreview={userId ? loadPreview : undefined}
      previewScope={previewScope}
      viewerHref={artifactPreviewPageHref(
        "publication",
        publicationId,
        contentRef,
      )}
    />
  );
}
