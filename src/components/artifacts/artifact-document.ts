import type {
  ArtifactPreviewKind,
  ArtifactPublicationState,
  SessionArtifact,
} from "@/features/api/types";

export type ArtifactSourceType = "publication" | "session_artifact";

export type DocumentRendererKind =
  | "image"
  | "pdf"
  | "html"
  | "markdown"
  | "text"
  | "json"
  | "jsonl"
  | "csv"
  | "download";

export type ArtifactViewerCapability =
  | "preview"
  | "download"
  | "open"
  | "fullscreen";

export type ArtifactDocument = {
  id: string;
  sourceType: ArtifactSourceType;
  previewMode: "document";
  title: string;
  filename?: string;
  sizeBytes?: number;
  contentType?: string;
  status: string;
  statusMessage?: string;
  previewKind?: ArtifactPreviewKind;
  downloadHref?: string;
  createdAt?: string;
};

export type ArtifactPreviewDescriptor = {
  url?: string;
  previewKind?: ArtifactPreviewKind;
  contentType?: string;
  filename?: string;
};

export type BuiltinArtifactRenderer = {
  id:
    | "builtin:image"
    | "builtin:pdf"
    | "builtin:html"
    | "builtin:markdown"
    | "builtin:text"
    | "builtin:json"
    | "builtin:jsonl"
    | "builtin:csv"
    | "builtin:download";
  kind: DocumentRendererKind;
  capabilities: ArtifactViewerCapability[];
  dataSource: "url" | "text" | "none";
};

const rendererDefinitions: Record<
  DocumentRendererKind,
  BuiltinArtifactRenderer
> = {
  image: renderer("image", "url"),
  pdf: renderer("pdf", "url"),
  html: renderer("html", "url"),
  markdown: renderer("markdown", "text"),
  text: renderer("text", "text"),
  json: renderer("json", "text"),
  jsonl: renderer("jsonl", "text"),
  csv: renderer("csv", "text"),
  download: {
    id: "builtin:download",
    kind: "download",
    capabilities: ["download", "open"],
    dataSource: "none",
  },
};

export const builtinArtifactRendererRegistry = Object.freeze(
  Object.values(rendererDefinitions),
);

export function resolveArtifactRenderer(
  artifact: Pick<ArtifactDocument, "contentType" | "filename" | "previewKind">,
  preview?: ArtifactPreviewDescriptor,
) {
  const kind =
    kindFromPreview(preview?.previewKind ?? artifact.previewKind) ??
    kindFromContentType(preview?.contentType ?? artifact.contentType) ??
    kindFromFilename(preview?.filename ?? artifact.filename) ??
    "download";

  return rendererDefinitions[kind];
}

export function artifactDocumentFromPublication({
  contentRef,
  downloadHref,
  fallbackTitle,
  publicationId,
  state,
}: {
  contentRef: string;
  downloadHref?: string;
  fallbackTitle: string;
  publicationId: string;
  state?: ArtifactPublicationState;
}): ArtifactDocument {
  const publication = state?.publication;
  const artifact = state?.artifact;
  const content = primaryArtifactContent(artifact, contentRef);

  return {
    id: publicationId,
    sourceType: "publication",
    previewMode: "document",
    title:
      publication?.title ??
      publication?.filename ??
      artifact?.title ??
      fallbackTitle,
    filename: content?.filename ?? publication?.filename,
    sizeBytes: content?.size_bytes,
    contentType: content?.content_type,
    status: publication?.status ?? "loading",
    statusMessage: publication?.error_message,
    downloadHref,
    createdAt: publication?.created_at ?? artifact?.created_at,
  };
}

export function artifactDocumentFromSessionArtifact(
  artifact: SessionArtifact,
  downloadHref?: string,
): ArtifactDocument {
  const content = primaryArtifactContent(artifact);

  return {
    id: artifact.artifact_id,
    sourceType: "session_artifact",
    previewMode: "document",
    title: artifact.title ?? content?.filename ?? artifact.artifact_id,
    filename: content?.filename,
    sizeBytes: content?.size_bytes,
    contentType: content?.content_type,
    status: artifact.status,
    statusMessage: artifact.status === "failed" ? artifact.summary : undefined,
    downloadHref,
    createdAt: artifact.created_at,
  };
}

export function primaryArtifactContent(
  artifact?: Pick<SessionArtifact, "contents">,
  preferredRef = "main",
) {
  return (
    artifact?.contents?.find((content) => content.ref === preferredRef) ??
    artifact?.contents?.find((content) => content.ref === "main") ??
    artifact?.contents?.[0]
  );
}

function renderer(
  kind: Exclude<DocumentRendererKind, "download">,
  dataSource: "url" | "text",
): BuiltinArtifactRenderer {
  return {
    id: `builtin:${kind}`,
    kind,
    capabilities: ["preview", "download", "open", "fullscreen"],
    dataSource,
  };
}

function kindFromPreview(
  value?: ArtifactPreviewKind,
): DocumentRendererKind | undefined {
  const normalized = value?.toLowerCase().replace(/[-_ ]/g, "");
  const map: Record<string, DocumentRendererKind> = {
    image: "image",
    pdf: "pdf",
    html: "html",
    markdown: "markdown",
    md: "markdown",
    text: "text",
    json: "json",
    jsonl: "jsonl",
    ndjson: "jsonl",
    csv: "csv",
    download: "download",
    downloadonly: "download",
  };
  return normalized ? map[normalized] : undefined;
}

function kindFromContentType(value?: string): DocumentRendererKind | undefined {
  const contentType = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType) {
    return undefined;
  }
  if (contentType.startsWith("image/")) {
    return "image";
  }

  const exact: Record<string, DocumentRendererKind> = {
    "application/pdf": "pdf",
    "text/html": "html",
    "application/xhtml+xml": "html",
    "text/markdown": "markdown",
    "text/x-markdown": "markdown",
    "application/json": "json",
    "application/ld+json": "json",
    "application/x-ndjson": "jsonl",
    "application/jsonl": "jsonl",
    "application/x-jsonlines": "jsonl",
    "text/csv": "csv",
    "application/csv": "csv",
    "text/plain": "text",
  };

  return (
    exact[contentType] ??
    (contentType.endsWith("+json") ? "json" : undefined) ??
    (contentType.startsWith("text/") ? "text" : undefined)
  );
}

function kindFromFilename(value?: string): DocumentRendererKind | undefined {
  const filename = value?.toLowerCase().split(/[?#]/, 1)[0];
  if (!filename) {
    return undefined;
  }

  const extensions: [string[], DocumentRendererKind][] = [
    [[".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"], "image"],
    [[".pdf"], "pdf"],
    [[".html", ".htm"], "html"],
    [[".md", ".markdown", ".mdx"], "markdown"],
    [[".jsonl", ".ndjson"], "jsonl"],
    [[".json", ".geojson"], "json"],
    [[".csv"], "csv"],
    [[".txt", ".log", ".diff", ".patch", ".xml", ".yaml", ".yml"], "text"],
  ];

  return extensions.find(([suffixes]) =>
    suffixes.some((suffix) => filename.endsWith(suffix)),
  )?.[1];
}
