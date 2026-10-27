"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import {
  CSSProperties,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  Download,
  ExternalLink,
  FileDown,
  FileText,
  Link2,
  Image as ImageIcon,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MarkdownMessage,
  MermaidCodeBlock,
} from "@/components/ui/markdown-message";
import { TruncatedText } from "@/components/ui/text";
import { LocalFileLinkContext } from "@/features/local-files/local-file-link-context";
import { cn } from "@/lib/utils";
import { compactDate } from "@/lib/format";
import { useArtifactPreviewStore } from "@/stores/artifact-preview-store";
import {
  ArtifactImagePreview,
  type ArtifactImageState,
} from "./artifact-image-preview";
import {
  ArtifactDocument,
  ArtifactPreviewDescriptor,
  DocumentRendererKind,
  resolveArtifactRenderer,
} from "./artifact-document";
import {
  ARTIFACT_PREVIEW_BUDGET,
  ArtifactPreviewTooLargeError,
  ArtifactPreviewText,
  parseCsvPreview,
  parseJsonlPreview,
  readArtifactPreviewBlob,
  readArtifactPreviewText,
} from "./artifact-preview-data";

type LoadedArtifactPreview = ArtifactPreviewDescriptor &
  Partial<ArtifactPreviewText>;

type ArtifactViewerShellProps = {
  /** Hide fullscreen when the shell is already inside a modal dialog. */
  allowFullscreen?: boolean;
  artifact: ArtifactDocument;
  autoLoad?: boolean;
  className?: string;
  error?: Error | null;
  loadPreview?: () => Promise<ArtifactPreviewDescriptor>;
  previewScope?: string;
  standalone?: boolean;
  navigation?: ReactNode;
  viewerHref?: string;
};

export function ArtifactViewerShell(props: ArtifactViewerShellProps) {
  return (
    <ArtifactViewer
      key={JSON.stringify([
        props.artifact.sourceType,
        props.artifact.id,
        props.previewScope,
      ])}
      {...props}
    />
  );
}

function ArtifactViewer({
  allowFullscreen = true,
  artifact,
  autoLoad = false,
  className,
  error: sourceError,
  loadPreview,
  previewScope,
  standalone = false,
  navigation,
  viewerHref,
}: ArtifactViewerShellProps) {
  const [preview, setPreview] = useState<LoadedArtifactPreview>();
  const [previewError, setPreviewError] = useState<Error | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const copyMessageTimeoutRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const [visibility, setVisibility] = useState<"closed" | "open" | "collapsed">(
    autoLoad || standalone ? "open" : "closed",
  );
  const [imageState, setImageState] = useState<ArtifactImageState>({});
  const viewerId = useId();
  const bodyId = useId();
  const shellRef = useRef<HTMLElement>(null);
  const previewButtonRef = useRef<HTMLButtonElement>(null);
  const fullscreenButtonRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef({ top: 0, left: 0 });
  const restoreFocusRef = useRef(false);
  const scope = standalone ? undefined : previewScope;
  const activeViewer = useArtifactPreviewStore((state) =>
    scope ? state.activeByScope[scope] : undefined,
  );
  const activate = useArtifactPreviewStore((state) => state.activate);
  const release = useArtifactPreviewStore((state) => state.release);
  const expanded =
    visibility === "open" && (!scope || activeViewer === viewerId);
  const isFullscreen = fullscreen && expanded;
  const autoLoadedArtifactRef = useRef<string | undefined>(undefined);
  const previewObjectUrlRef = useRef<string | undefined>(undefined);
  const previewRequestRef = useRef(0);
  const renderer = resolveArtifactRenderer(artifact, preview);
  const title =
    artifact.title.trim() || artifact.filename || "Untitled artifact";
  const readerStatus =
    previewError || sourceError || artifact.status === "failed"
      ? "Preview unavailable"
      : previewPending || artifact.status === "loading"
        ? "Loading…"
        : !isArtifactAvailable(artifact.status)
          ? "Processing…"
          : undefined;

  useEffect(() => () => clearTimeout(copyMessageTimeoutRef.current), []);

  const handleCopyLink = async () => {
    clearTimeout(copyMessageTimeoutRef.current);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyMessage("Link copied");
    } catch {
      setCopyMessage(
        "Couldn't copy link. Try again or copy the address bar URL.",
      );
    }
    copyMessageTimeoutRef.current = setTimeout(() => setCopyMessage(""), 4000);
  };

  const revokePreviewObjectUrl = useCallback((url?: string) => {
    if (!url) {
      return;
    }
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Revocation is best-effort during refresh and component cleanup.
    }
  }, []);

  const clearPreviewObjectUrl = useCallback(() => {
    const current = previewObjectUrlRef.current;
    previewObjectUrlRef.current = undefined;
    revokePreviewObjectUrl(current);
  }, [revokePreviewObjectUrl]);

  useEffect(() => {
    return () => {
      previewRequestRef.current += 1;
      clearPreviewObjectUrl();
      if (scope) {
        release(scope, viewerId);
      }
    };
  }, [clearPreviewObjectUrl, release, scope, viewerId]);

  useEffect(() => {
    if (visibility !== "open" && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      previewButtonRef.current?.focus();
    }
  }, [visibility]);

  const openPreview = useCallback(() => {
    setVisibility("open");
    if (scope) {
      activate(scope, viewerId);
    }
  }, [activate, scope, viewerId]);

  const closePreview = useCallback(() => {
    autoLoadedArtifactRef.current = artifact.id;
    previewRequestRef.current += 1;
    clearPreviewObjectUrl();
    setPreview(undefined);
    setPreviewError(null);
    setPreviewPending(false);
    setImageState({});
    setFullscreen(false);
    setVisibility("closed");
    scrollRef.current = { top: 0, left: 0 };
    restoreFocusRef.current = true;
    if (scope) {
      release(scope, viewerId);
    }
  }, [artifact.id, clearPreviewObjectUrl, release, scope, viewerId]);

  const handlePreview = useCallback(async () => {
    if (!loadPreview) {
      return;
    }

    const requestId = ++previewRequestRef.current;
    autoLoadedArtifactRef.current = artifact.id;
    openPreview();
    setPreviewPending(true);
    setPreviewError(null);
    setImageState({});
    try {
      assertUrlPreviewWithinBudget(artifact, resolveArtifactRenderer(artifact));
      const descriptor = await loadPreview();
      if (requestId !== previewRequestRef.current) {
        return;
      }
      const resolved = resolveArtifactRenderer(artifact, descriptor);
      assertUrlPreviewWithinBudget(artifact, resolved);
      if (resolved.dataSource === "text" && descriptor.url) {
        const text = await readArtifactPreviewText(descriptor.url);
        if (requestId !== previewRequestRef.current) {
          return;
        }
        clearPreviewObjectUrl();
        setPreview({ ...descriptor, ...text });
      } else if (resolved.dataSource === "url" && descriptor.url) {
        const blob = await readArtifactPreviewBlob(
          descriptor.url,
          ARTIFACT_PREVIEW_BUDGET.maxBlobBytes,
          descriptor.contentType ?? artifact.contentType,
        );
        if (requestId !== previewRequestRef.current) {
          return;
        }

        let objectUrl: string;
        try {
          // HTML may arrive as text/plain or octet-stream. The resolved
          // renderer determines the isolated preview document MIME type.
          objectUrl = URL.createObjectURL(
            resolved.kind === "html"
              ? blob.slice(0, blob.size, "text/html")
              : blob,
          );
        } catch {
          throw new Error("Preview response could not be prepared");
        }
        if (requestId !== previewRequestRef.current) {
          revokePreviewObjectUrl(objectUrl);
          return;
        }

        const previousObjectUrl = previewObjectUrlRef.current;
        previewObjectUrlRef.current = objectUrl;
        setPreview({ ...descriptor, url: objectUrl });
        revokePreviewObjectUrl(previousObjectUrl);
      } else {
        if (requestId !== previewRequestRef.current) {
          return;
        }
        clearPreviewObjectUrl();
        setPreview(descriptor);
      }
    } catch (caught) {
      if (requestId !== previewRequestRef.current) {
        return;
      }
      clearPreviewObjectUrl();
      setPreview(undefined);
      setPreviewError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    } finally {
      if (requestId === previewRequestRef.current) {
        setPreviewPending(false);
      }
    }
  }, [
    artifact,
    clearPreviewObjectUrl,
    loadPreview,
    openPreview,
    revokePreviewObjectUrl,
  ]);

  useEffect(() => {
    if (
      !autoLoad ||
      !loadPreview ||
      !isArtifactAvailable(artifact.status) ||
      autoLoadedArtifactRef.current === artifact.id
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      if (autoLoadedArtifactRef.current !== artifact.id) {
        void handlePreview();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [artifact.id, artifact.status, autoLoad, handlePreview, loadPreview]);

  const shell = (
    <section
      ref={shellRef}
      aria-label={`Artifact viewer: ${title}`}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-hairline bg-surface-1",
        isFullscreen
          ? "h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] shadow-2xl"
          : standalone && expanded
            ? "h-full max-h-none"
            : "max-h-[42rem]",
        className,
      )}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          expanded &&
          (isFullscreen || !standalone)
        ) {
          event.stopPropagation();
          if (isFullscreen) {
            setFullscreen(false);
          } else {
            closePreview();
          }
        }
      }}
    >
      {isFullscreen && (
        <Dialog.Title className="sr-only">
          Artifact viewer: {artifact.title}
        </Dialog.Title>
      )}
      {standalone ? (
        <header className="flex min-w-0 shrink-0 items-center gap-1 border-b border-hairline px-2 py-2 sm:gap-3 sm:px-3">
          {navigation && <div className="shrink-0">{navigation}</div>}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <FileText
              aria-hidden="true"
              className="hidden h-4 w-4 shrink-0 text-ink-tertiary sm:block"
            />
            <div className="min-w-0 flex-1">
              <h1 className="min-w-0 text-sm font-medium text-ink">
                <TruncatedText>{title}</TruncatedText>
              </h1>
              {readerStatus && (
                <p className="truncate text-xs text-ink-muted" role="status">
                  {readerStatus}
                </p>
              )}
            </div>
          </div>
          <Button
            className="hidden sm:inline-flex"
            icon={<Link2 className="h-4 w-4" />}
            onClick={() => void handleCopyLink()}
            size="sm"
            variant="ghost"
          >
            Copy link
          </Button>
          {artifact.downloadHref && isArtifactAvailable(artifact.status) && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              tooltip="Download"
              className="max-sm:h-9 max-sm:w-9 max-sm:justify-center max-sm:px-0"
            >
              <a
                aria-label="Download"
                href={artifact.downloadHref}
                download
                rel="noreferrer"
                target="_self"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </a>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="Artifact options"
                icon={<MoreHorizontal className="h-4 w-4" />}
                size="icon"
                tooltip="More options"
                variant="ghost"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-w-[calc(100vw-2rem)]">
              <DropdownMenuItem onSelect={() => void handleCopyLink()}>
                <Link2 className="h-4 w-4" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={
                  !loadPreview ||
                  previewPending ||
                  !isArtifactAvailable(artifact.status)
                }
                onSelect={() => void handlePreview()}
              >
                Refresh
              </DropdownMenuItem>
              {preview?.url && (
                <DropdownMenuItem asChild>
                  <a href={preview.url} rel="noreferrer" target="_blank">
                    Open file
                  </a>
                </DropdownMenuItem>
              )}
              <div className="mt-1 max-w-xs break-words border-t border-hairline px-2.5 py-2 text-xs text-ink-muted">
                <div className="mb-1 font-medium text-ink">File details</div>
                <dl className="space-y-1">
                  {artifact.filename && artifact.filename !== title && (
                    <div>
                      <dt className="text-ink-tertiary">Filename</dt>
                      <dd>{artifact.filename}</dd>
                    </div>
                  )}
                  {artifact.sizeBytes != null && (
                    <div>
                      <dt className="inline text-ink-tertiary">Size </dt>
                      <dd className="inline">
                        {formatArtifactBytes(artifact.sizeBytes)}
                      </dd>
                    </div>
                  )}
                  {artifact.createdAt && (
                    <div>
                      <dt className="inline text-ink-tertiary">Created </dt>
                      <dd className="inline">
                        <time dateTime={artifact.createdAt}>
                          {compactDate(artifact.createdAt)}
                        </time>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
      ) : (
        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-2 px-3 py-2",
            expanded && "border-b border-hairline",
          )}
        >
          {renderer.kind === "image" ? (
            <ImageIcon className="h-4 w-4 shrink-0 text-ink-tertiary" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-ink-tertiary" />
          )}
          <div className="min-w-0 flex-1 basis-24">
            <TruncatedText className="text-sm font-medium text-ink">
              {artifact.title}
            </TruncatedText>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-tertiary">
              {artifact.filename && artifact.filename !== artifact.title && (
                <TruncatedText tooltip={artifact.filename}>
                  {artifact.filename}
                </TruncatedText>
              )}
              {artifact.sizeBytes ? (
                <span>{formatArtifactBytes(artifact.sizeBytes)}</span>
              ) : null}
            </div>
          </div>
          {artifact.status !== "available" && (
            <Badge tone={artifact.status === "failed" ? "warning" : "neutral"}>
              {artifact.status}
            </Badge>
          )}
          <div className="flex max-w-full flex-wrap items-center gap-1">
            {!expanded ? (
              <Button
                aria-controls={bodyId}
                aria-expanded={false}
                aria-label={
                  visibility === "closed" ? "Preview" : "Expand preview"
                }
                disabled={
                  !loadPreview ||
                  (visibility === "closed" && previewPending) ||
                  !isArtifactAvailable(artifact.status)
                }
                icon={
                  previewPending ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )
                }
                onClick={() => {
                  if (visibility !== "closed") {
                    setFullscreen(false);
                    openPreview();
                  } else {
                    void handlePreview();
                  }
                }}
                ref={previewButtonRef}
                size="sm"
                type="button"
                variant={visibility === "closed" ? "primary" : "secondary"}
              >
                {visibility === "closed" ? "Preview" : "Expand"}
              </Button>
            ) : (
              <>
                <Button
                  aria-label={
                    previewError || imageState.failed
                      ? "Retry preview"
                      : "Refresh"
                  }
                  disabled={
                    !loadPreview ||
                    previewPending ||
                    !isArtifactAvailable(artifact.status)
                  }
                  icon={
                    previewPending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )
                  }
                  onClick={() => void handlePreview()}
                  size="icon"
                  tooltip={
                    previewError || imageState.failed
                      ? "Retry preview"
                      : "Refresh"
                  }
                  type="button"
                  variant="ghost"
                />
              </>
            )}
            {viewerHref && (
              <Button asChild size="icon" tooltip="Open page" variant="ghost">
                <Link aria-label="Open page" href={viewerHref}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            )}
            {artifact.downloadHref && (
              <Button asChild size="icon" tooltip="Download" variant="ghost">
                <a
                  aria-label="Download"
                  href={artifact.downloadHref}
                  download
                  rel="noreferrer"
                  target="_self"
                >
                  <Download className="h-4 w-4" />
                </a>
              </Button>
            )}
            {expanded && preview?.url && (
              <Button asChild size="icon" tooltip="Open file" variant="ghost">
                <a
                  aria-label="Open file"
                  href={preview.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
            {expanded && allowFullscreen && (
              <Button
                aria-label={
                  isFullscreen
                    ? "Exit artifact fullscreen"
                    : "Open artifact fullscreen"
                }
                icon={
                  isFullscreen ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )
                }
                onClick={() => setFullscreen(!isFullscreen)}
                ref={fullscreenButtonRef}
                size="icon"
                tooltip={isFullscreen ? "Exit fullscreen" : "Open fullscreen"}
                type="button"
                variant="ghost"
              />
            )}
            {visibility !== "closed" && !standalone && (
              <>
                {expanded && (
                  <Button
                    aria-controls={bodyId}
                    aria-expanded={true}
                    aria-label="Collapse preview"
                    icon={<ChevronDown className="h-4 w-4" />}
                    onClick={() => {
                      restoreFocusRef.current = true;
                      setVisibility("collapsed");
                      setFullscreen(false);
                      if (scope) release(scope, viewerId);
                    }}
                    size="icon"
                    tooltip="Collapse preview"
                    type="button"
                    variant="ghost"
                  />
                )}
                <Button
                  aria-label="Close preview"
                  icon={<X className="h-4 w-4" />}
                  onClick={closePreview}
                  size="icon"
                  tooltip="Close preview"
                  type="button"
                  variant="ghost"
                />
              </>
            )}
          </div>
        </div>
      )}
      {standalone && copyMessage && (
        <div
          role="status"
          className="shrink-0 border-b border-hairline px-3 py-2 text-xs text-ink-muted"
        >
          {copyMessage}
        </div>
      )}

      {visibility !== "closed" && (
        <div
          aria-label="Artifact preview"
          className="min-h-0 flex-1 overflow-auto bg-canvas"
          hidden={!expanded}
          id={bodyId}
          onScroll={(event) => {
            scrollRef.current = {
              top: event.currentTarget.scrollTop,
              left: event.currentTarget.scrollLeft,
            };
          }}
          ref={(element) => {
            if (element) {
              element.scrollTop = scrollRef.current.top;
              element.scrollLeft = scrollRef.current.left;
            }
          }}
          role="region"
        >
          <ArtifactViewerBody
            artifact={artifact}
            error={previewError ?? sourceError}
            pending={previewPending}
            preview={preview}
            rendererKind={renderer.kind}
            standalone={standalone || isFullscreen}
            imageState={imageState}
            onImageChange={setImageState}
          />
        </div>
      )}
      {visibility === "closed" &&
        (sourceError || artifact.status === "failed") && (
          <p className="px-3 pb-2 text-xs text-warning" role="alert">
            {sourceError?.message ??
              artifact.statusMessage ??
              "Artifact publication failed."}
          </p>
        )}
    </section>
  );

  return (
    <Dialog.Root open={isFullscreen} onOpenChange={setFullscreen}>
      {isFullscreen ? (
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm" />
          <Dialog.Content
            aria-describedby={undefined}
            asChild
            className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              shellRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              window.requestAnimationFrame(() =>
                fullscreenButtonRef.current?.focus(),
              );
            }}
          >
            {shell}
          </Dialog.Content>
        </Dialog.Portal>
      ) : (
        shell
      )}
    </Dialog.Root>
  );
}

function ArtifactViewerBody({
  artifact,
  error,
  pending,
  preview,
  rendererKind,
  standalone,
  imageState,
  onImageChange,
}: {
  artifact: ArtifactDocument;
  error?: Error | null;
  pending: boolean;
  preview?: LoadedArtifactPreview;
  rendererKind: DocumentRendererKind;
  standalone: boolean;
  imageState: ArtifactImageState;
  onImageChange: Dispatch<SetStateAction<ArtifactImageState>>;
}) {
  if (pending || artifact.status === "loading") {
    return (
      <ViewerState
        icon={<LoaderCircle className="h-5 w-5 animate-spin" />}
        message="Preparing artifact preview…"
      />
    );
  }
  if (error) {
    return (
      <ViewerState message={`${error.name}: ${error.message}`} tone="warning" />
    );
  }
  if (artifact.status === "failed") {
    return (
      <ViewerState
        message={artifact.statusMessage ?? "Artifact publication failed."}
        tone="warning"
      />
    );
  }
  if (!isArtifactAvailable(artifact.status)) {
    return <ViewerState message="Artifact content is not available yet." />;
  }
  if (!preview) {
    return (
      <ViewerState message="Select Preview to load a short-lived, permission-checked view." />
    );
  }

  return (
    <div className={cn("min-h-full", standalone && "h-full")}>
      {preview.truncated && (
        <div className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Preview truncated.{" "}
          {preview.truncationReason ??
            "Download or open the artifact to inspect the full file."}
        </div>
      )}
      <DocumentRenderer
        artifact={artifact}
        kind={rendererKind}
        preview={preview}
        standalone={standalone}
        imageState={imageState}
        onImageChange={onImageChange}
      />
    </div>
  );
}

function DocumentRenderer({
  artifact,
  kind,
  preview,
  standalone,
  imageState,
  onImageChange,
}: {
  artifact: ArtifactDocument;
  kind: DocumentRendererKind;
  preview: LoadedArtifactPreview;
  standalone: boolean;
  imageState: ArtifactImageState;
  onImageChange: Dispatch<SetStateAction<ArtifactImageState>>;
}) {
  if (kind === "image" && preview.url) {
    return (
      <ArtifactImagePreview
        fillHeight={standalone}
        onChange={onImageChange}
        src={preview.url}
        state={imageState}
        title={artifact.title}
      />
    );
  }
  if (kind === "pdf" && preview.url) {
    return (
      <iframe
        className={cn(
          "h-[38rem] w-full bg-white",
          standalone && "h-full min-h-[calc(100dvh-13rem)]",
        )}
        referrerPolicy="no-referrer"
        src={preview.url}
        title={artifact.title}
      />
    );
  }
  if (kind === "html" && preview.url) {
    return (
      <iframe
        className={cn(
          "h-[38rem] w-full bg-white",
          standalone && "h-full min-h-[calc(100dvh-13rem)]",
        )}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts"
        src={preview.url}
        title={artifact.title}
      />
    );
  }
  if (kind === "mermaid" && preview.content !== undefined) {
    return <MermaidCodeBlock content={preview.content} />;
  }

  if (kind === "markdown" && preview.content !== undefined) {
    return (
      <DocumentMarkdownRenderer
        content={preview.content}
        standalone={standalone}
      />
    );
  }
  if (kind === "json" && preview.content !== undefined) {
    return <DocumentJsonRenderer content={preview.content} />;
  }
  if (kind === "jsonl" && preview.content !== undefined) {
    return <DocumentJsonlRenderer content={preview.content} />;
  }
  if (kind === "csv" && preview.content !== undefined) {
    return <DocumentCsvRenderer content={preview.content} />;
  }
  if (kind === "text" && preview.content !== undefined) {
    return (
      <pre
        className={cn(
          "min-h-80 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-5 text-ink-muted",
          standalone && "min-h-full",
        )}
      >
        {preview.content || "This text file is empty."}
      </pre>
    );
  }

  return (
    <ViewerState
      icon={<FileDown className="h-5 w-5" />}
      message="This artifact type is download-only in the document viewer."
    />
  );
}

function DocumentMarkdownRenderer({
  content,
  standalone,
}: {
  content: string;
  standalone: boolean;
}) {
  const readerRef = useRef<HTMLDivElement>(null);
  const headings = useMemo(() => markdownHeadings(content), [content]);
  const [fontSize, setFontSize] = useStoredNumber(
    "pax:artifact-reader-font-size",
    15,
    13,
    20,
  );
  const [lineHeight, setLineHeight] = useStoredNumber(
    "pax:artifact-reader-line-height",
    1.65,
    1.4,
    2,
  );

  useEffect(() => {
    const nodes = readerRef.current?.querySelectorAll("h2, h3");
    nodes?.forEach((node, index) => {
      node.id = headings[index]?.id ?? "";
    });
  }, [headings]);

  const readerStyle = {
    "--artifact-reader-font-size": `${fontSize}px`,
    "--artifact-reader-line-height": String(lineHeight),
  } as CSSProperties;

  return (
    <div className="@container/artifact-reader min-w-0" style={readerStyle}>
      <div
        className={cn(
          "grid min-h-80 grid-cols-1 bg-[#11110f]",
          standalone &&
            "min-h-full @min-[56rem]/artifact-reader:grid-cols-[minmax(0,1fr)_13rem]",
        )}
      >
        <article
          className="mx-auto min-w-0 w-full max-w-4xl bg-[#f1eee6] px-6 py-8 text-[#25231f] shadow-sm @min-[40rem]/artifact-reader:px-10"
          ref={readerRef}
        >
          {/* Artifact documents are not session chat: their local file
              links stay copy-only even when embedded in a session view. */}
          <LocalFileLinkContext.Provider value={null}>
            <MarkdownMessage
              className="text-[length:var(--artifact-reader-font-size)] leading-[var(--artifact-reader-line-height)] text-[#37342e] [&_a]:text-[#3f478f] [&_blockquote]:text-[#625e55] [&_h1]:text-[#211f1b] [&_h2]:text-[#211f1b] [&_h3]:text-[#211f1b] [&_strong]:text-[#211f1b] [&_td]:border-[#d4cfc3] [&_th]:border-[#d4cfc3] [&_th]:bg-[#ded9cd]"
              content={content}
            />
          </LocalFileLinkContext.Provider>
        </article>
        {standalone && (
          <aside
            aria-label="Reader settings"
            className="hidden border-l border-hairline bg-surface-1 p-3 @min-[56rem]/artifact-reader:block"
          >
            <div className="sticky top-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                  Reader
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    aria-label="Decrease artifact reader font size"
                    disabled={fontSize <= 13}
                    icon={<Minus className="h-3.5 w-3.5" />}
                    onClick={() => setFontSize(fontSize - 1)}
                    size="icon"
                    tooltip="Decrease font size"
                    type="button"
                    variant="ghost"
                  />
                  <Button
                    aria-label="Increase artifact reader font size"
                    disabled={fontSize >= 20}
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => setFontSize(fontSize + 1)}
                    size="icon"
                    tooltip="Increase font size"
                    type="button"
                    variant="ghost"
                  />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-tertiary">
                <span>Line height</span>
                <button
                  className="rounded px-1.5 py-1 font-mono hover:bg-surface-2 hover:text-ink"
                  onClick={() =>
                    setLineHeight(lineHeight >= 1.95 ? 1.4 : lineHeight + 0.1)
                  }
                  type="button"
                >
                  {lineHeight.toFixed(1)}
                </button>
              </div>
              {headings.length > 0 && (
                <nav aria-label="Artifact table of contents" className="mt-5">
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-tertiary">
                    Contents
                  </div>
                  <div className="grid gap-1">
                    {headings.map((heading, index) => (
                      <a
                        className={cn(
                          "truncate rounded px-2 py-1 text-xs text-ink-subtle transition hover:bg-surface-2 hover:text-ink",
                          heading.level === 3 && "pl-4",
                        )}
                        href={`#${heading.id}`}
                        key={`${heading.id}:${index}`}
                        title={heading.label}
                      >
                        {heading.label}
                      </a>
                    ))}
                  </div>
                </nav>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function DocumentJsonRenderer({ content }: { content: string }) {
  let formatted = content;
  let invalid = false;
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    invalid = true;
  }

  return (
    <div>
      {invalid && (
        <div className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          Invalid or truncated JSON; showing the available source.
        </div>
      )}
      <CodeLines content={formatted} />
    </div>
  );
}

function DocumentJsonlRenderer({ content }: { content: string }) {
  const result = useMemo(() => parseJsonlPreview(content), [content]);
  return (
    <div className="grid gap-3 p-3">
      {result.records.map((record, index) => (
        <section
          className="overflow-hidden rounded-md border border-hairline bg-surface-1"
          key={index}
        >
          <div className="border-b border-hairline px-3 py-1.5 font-mono text-xs text-ink-tertiary">
            record {index + 1}
            {record.invalid ? " · invalid JSON" : ""}
          </div>
          <CodeLines content={record.content} />
        </section>
      ))}
      {result.records.length === 0 && (
        <ViewerState message="This JSONL file contains no records." />
      )}
      {result.truncated && (
        <div className="text-xs text-warning">
          JSONL preview limited to{" "}
          {ARTIFACT_PREVIEW_BUDGET.maxJsonlRecords.toLocaleString()} records.
        </div>
      )}
    </div>
  );
}

function DocumentCsvRenderer({ content }: { content: string }) {
  const result = useMemo(() => parseCsvPreview(content), [content]);
  if (result.header.length === 0) {
    return <ViewerState message="This CSV file is empty." />;
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
        <thead className="sticky top-0 z-10 bg-surface-2 text-ink">
          <tr>
            <th className="sticky left-0 border-b border-r border-hairline bg-surface-2 px-2 py-2 font-mono font-normal text-ink-tertiary">
              #
            </th>
            {result.header.map((cell, index) => (
              <th
                className="max-w-80 border-b border-r border-hairline px-3 py-2 font-medium"
                key={index}
                title={cell}
              >
                <span className="block truncate">
                  {cell || `Column ${index + 1}`}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, rowIndex) => (
            <tr className="group hover:bg-surface-2/70" key={rowIndex}>
              <th className="sticky left-0 border-b border-r border-hairline bg-canvas px-2 py-2 font-mono font-normal text-ink-tertiary group-hover:bg-surface-2">
                {rowIndex + 1}
              </th>
              {result.header.map((_, columnIndex) => (
                <td
                  className="max-w-80 border-b border-r border-hairline px-3 py-2 text-ink-muted"
                  key={columnIndex}
                  title={row[columnIndex] ?? ""}
                >
                  <span className="block truncate">
                    {row[columnIndex] ?? ""}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {result.truncated && (
        <div className="sticky bottom-0 border-t border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          CSV preview limited to {ARTIFACT_PREVIEW_BUDGET.maxCsvRows} rows and{" "}
          {ARTIFACT_PREVIEW_BUDGET.maxCsvColumns} columns.
        </div>
      )}
    </div>
  );
}

function CodeLines({ content }: { content: string }) {
  return (
    <div className="overflow-auto bg-[#0b0b0c] py-2 font-mono text-xs leading-5">
      {content.split("\n").map((line, index) => (
        <div
          className="grid grid-cols-[3rem_minmax(max-content,1fr)]"
          key={index}
        >
          <span className="select-none border-r border-hairline px-2 text-right text-ink-tertiary">
            {index + 1}
          </span>
          <code className="whitespace-pre px-3 text-ink-muted">
            <JsonHighlightedLine line={line} />
          </code>
        </div>
      ))}
    </div>
  );
}

function JsonHighlightedLine({ line }: { line: string }) {
  const tokens = line.split(
    /("(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/gi,
  );
  return tokens.map((token, index) => {
    let className = "";
    if (/^".*"$/.test(token)) {
      className = "text-[#a5d6ff]";
    } else if (/^(true|false|null)$/i.test(token)) {
      className = "text-[#ff7b72]";
    } else if (/^-?\d/.test(token)) {
      className = "text-[#ffa657]";
    }
    return (
      <span className={className} key={index}>
        {token}
      </span>
    );
  });
}

function ViewerState({
  icon,
  message,
  tone = "muted",
}: {
  icon?: ReactNode;
  message: string;
  tone?: "muted" | "warning";
}) {
  return (
    <div
      className={cn(
        "grid min-h-44 place-items-center p-6 text-center text-xs",
        tone === "warning" ? "text-warning" : "text-ink-tertiary",
      )}
    >
      <div className="grid max-w-sm justify-items-center gap-2">
        {icon}
        <span>{message}</span>
      </div>
    </div>
  );
}

function markdownHeadings(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => /^(#{2,3})\s+(.+?)\s*#*$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({
      id: markdownHeadingId(match[2]),
      label: match[2].replace(/[`_*~[\]]/g, "").trim(),
      level: match[1].length,
    }));
}

export function markdownHeadingId(value: string) {
  return value
    .toLowerCase()
    .replace(/[`_*~[\]()]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function useStoredNumber(
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    let stored: number;
    try {
      stored = Number(window.localStorage?.getItem(key));
    } catch {
      return;
    }
    if (Number.isFinite(stored) && stored >= min && stored <= max) {
      const frame = window.requestAnimationFrame(() => setValue(stored));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [key, max, min]);

  const update = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, Number(next.toFixed(2))));
      setValue(clamped);
      try {
        window.localStorage?.setItem(key, String(clamped));
      } catch {
        // Reader controls also work when browser storage is unavailable.
      }
    },
    [key, max, min],
  );

  return [value, update] as const;
}

function isArtifactAvailable(status: string) {
  return status === "available";
}

function assertUrlPreviewWithinBudget(
  artifact: Pick<ArtifactDocument, "sizeBytes">,
  renderer: Pick<ReturnType<typeof resolveArtifactRenderer>, "dataSource">,
) {
  if (
    renderer.dataSource === "url" &&
    artifact.sizeBytes !== undefined &&
    artifact.sizeBytes > ARTIFACT_PREVIEW_BUDGET.maxBlobBytes
  ) {
    throw new ArtifactPreviewTooLargeError(
      ARTIFACT_PREVIEW_BUDGET.maxBlobBytes,
    );
  }
}

function formatArtifactBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}
