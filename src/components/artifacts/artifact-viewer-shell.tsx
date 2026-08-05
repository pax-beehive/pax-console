"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CSSProperties,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Download,
  ExternalLink,
  FileDown,
  FileText,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { TruncatedText } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import {
  ArtifactDocument,
  ArtifactPreviewDescriptor,
  DocumentRendererKind,
  resolveArtifactRenderer,
} from "./artifact-document";
import {
  ARTIFACT_PREVIEW_BUDGET,
  ArtifactPreviewText,
  parseCsvPreview,
  parseJsonlPreview,
  readArtifactPreviewText,
} from "./artifact-preview-data";

type LoadedArtifactPreview = ArtifactPreviewDescriptor &
  Partial<ArtifactPreviewText>;

type ArtifactViewerShellProps = {
  artifact: ArtifactDocument;
  autoLoad?: boolean;
  className?: string;
  error?: Error | null;
  loadPreview?: () => Promise<ArtifactPreviewDescriptor>;
  standalone?: boolean;
  viewerHref?: string;
};

export function ArtifactViewerShell({
  artifact,
  autoLoad = false,
  className,
  error: sourceError,
  loadPreview,
  standalone = false,
  viewerHref,
}: ArtifactViewerShellProps) {
  const [preview, setPreview] = useState<LoadedArtifactPreview>();
  const [previewError, setPreviewError] = useState<Error | null>(null);
  const [previewPending, setPreviewPending] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const autoLoadedArtifactRef = useRef<string | undefined>(undefined);
  const renderer = resolveArtifactRenderer(artifact, preview);

  useEffect(() => {
    if (!fullscreen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullscreen]);

  const handlePreview = useCallback(async () => {
    if (!loadPreview) {
      return;
    }

    setPreviewPending(true);
    setPreviewError(null);
    try {
      const descriptor = await loadPreview();
      const resolved = resolveArtifactRenderer(artifact, descriptor);
      if (resolved.dataSource === "text" && descriptor.url) {
        const text = await readArtifactPreviewText(descriptor.url);
        setPreview({ ...descriptor, ...text });
      } else {
        setPreview(descriptor);
      }
    } catch (caught) {
      setPreviewError(
        caught instanceof Error ? caught : new Error(String(caught)),
      );
    } finally {
      setPreviewPending(false);
    }
  }, [artifact, loadPreview]);

  useEffect(() => {
    if (
      !autoLoad ||
      !loadPreview ||
      !isArtifactAvailable(artifact.status) ||
      autoLoadedArtifactRef.current === artifact.id
    ) {
      return;
    }

    autoLoadedArtifactRef.current = artifact.id;
    const frame = window.requestAnimationFrame(() => {
      void handlePreview();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [artifact.id, artifact.status, autoLoad, handlePreview, loadPreview]);

  const shell = (
    <section
      aria-label={`Artifact viewer: ${artifact.title}`}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-hairline bg-surface-1",
        fullscreen
          ? "h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] shadow-2xl"
          : standalone
            ? "h-full max-h-none"
            : "max-h-[42rem]",
        className,
      )}
      role={fullscreen ? "dialog" : undefined}
    >
      <div className="flex min-w-0 items-start gap-3 border-b border-hairline px-3 py-2.5">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary" />
        <div className="min-w-0 flex-1">
          <TruncatedText className="text-sm font-medium text-ink">
            {artifact.title}
          </TruncatedText>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-tertiary">
            {artifact.filename && (
              <TruncatedText tooltip={artifact.filename}>
                {artifact.filename}
              </TruncatedText>
            )}
            {artifact.sizeBytes ? (
              <span>{formatArtifactBytes(artifact.sizeBytes)}</span>
            ) : null}
            <span className="font-mono">{renderer.id}</span>
          </div>
        </div>
        <Badge tone={artifactStatusTone(artifact.status)}>
          {artifact.status}
        </Badge>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1 border-b border-hairline px-2 py-1.5">
        <Button
          disabled={
            !loadPreview ||
            previewPending ||
            !isArtifactAvailable(artifact.status)
          }
          icon={
            previewPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )
          }
          onClick={() => void handlePreview()}
          size="sm"
          type="button"
          variant="secondary"
        >
          {preview ? "Refresh" : "Preview"}
        </Button>
        {viewerHref && (
          <Button asChild size="sm" variant="secondary">
            <Link href={viewerHref}>
              <ExternalLink className="h-4 w-4" />
              <span className="min-w-0 truncate">Open page</span>
            </Link>
          </Button>
        )}
        {artifact.downloadHref && (
          <Button asChild size="sm" variant="ghost">
            <a href={artifact.downloadHref} rel="noreferrer" target="_blank">
              <Download className="h-4 w-4" />
              <span className="min-w-0 truncate">Download</span>
            </a>
          </Button>
        )}
        {preview?.url && (
          <Button asChild size="sm" variant="ghost">
            <a href={preview.url} rel="noreferrer" target="_blank">
              <ExternalLink className="h-4 w-4" />
              <span className="min-w-0 truncate">Open file</span>
            </a>
          </Button>
        )}
        <div className="min-w-0 flex-1" />
        <Button
          aria-label={
            fullscreen ? "Exit artifact fullscreen" : "Open artifact fullscreen"
          }
          icon={
            fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )
          }
          onClick={() => setFullscreen((current) => !current)}
          size="icon"
          tooltip={fullscreen ? "Exit fullscreen" : "Open fullscreen"}
          type="button"
          variant="ghost"
        />
        {fullscreen && (
          <Button
            aria-label="Close artifact fullscreen"
            icon={<X className="h-4 w-4" />}
            onClick={() => setFullscreen(false)}
            size="icon"
            tooltip="Close fullscreen"
            type="button"
            variant="ghost"
          />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-canvas">
        <ArtifactViewerBody
          artifact={artifact}
          error={previewError ?? sourceError}
          pending={previewPending}
          preview={preview}
          rendererKind={renderer.kind}
          standalone={standalone}
        />
      </div>
    </section>
  );

  if (fullscreen && typeof document !== "undefined") {
    return createPortal(
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
        {shell}
      </div>,
      document.body,
    );
  }

  return shell;
}

function ArtifactViewerBody({
  artifact,
  error,
  pending,
  preview,
  rendererKind,
  standalone,
}: {
  artifact: ArtifactDocument;
  error?: Error | null;
  pending: boolean;
  preview?: LoadedArtifactPreview;
  rendererKind: DocumentRendererKind;
  standalone: boolean;
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
      />
    </div>
  );
}

function DocumentRenderer({
  artifact,
  kind,
  preview,
  standalone,
}: {
  artifact: ArtifactDocument;
  kind: DocumentRendererKind;
  preview: LoadedArtifactPreview;
  standalone: boolean;
}) {
  if (kind === "image" && preview.url) {
    return (
      <div
        className={cn(
          "relative min-h-80 w-full bg-[linear-gradient(45deg,#111_25%,transparent_25%),linear-gradient(-45deg,#111_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111_75%),linear-gradient(-45deg,transparent_75%,#111_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]",
          standalone && "h-full min-h-[calc(100dvh-13rem)]",
        )}
      >
        <Image
          alt={artifact.title}
          className="object-contain p-3"
          fill
          sizes="(max-width: 1024px) 100vw, 960px"
          src={preview.url}
          unoptimized
        />
      </div>
    );
  }
  if (kind === "pdf" && preview.url) {
    return (
      <iframe
        className={cn(
          "h-[38rem] w-full bg-white",
          standalone && "h-full min-h-[calc(100dvh-13rem)]",
        )}
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
        sandbox=""
        src={preview.url}
        title={artifact.title}
      />
    );
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
    <div
      className={cn(
        "grid min-h-80 grid-cols-1 bg-[#11110f] lg:grid-cols-[minmax(0,1fr)_13rem]",
        standalone && "min-h-full",
      )}
      style={readerStyle}
    >
      <article
        className="mx-auto w-full max-w-4xl bg-[#f1eee6] px-6 py-8 text-[#25231f] shadow-sm sm:px-10"
        ref={readerRef}
      >
        <MarkdownMessage
          className="text-[length:var(--artifact-reader-font-size)] leading-[var(--artifact-reader-line-height)] text-[#37342e] [&_a]:text-[#3f478f] [&_blockquote]:text-[#625e55] [&_h1]:text-[#211f1b] [&_h2]:text-[#211f1b] [&_h3]:text-[#211f1b] [&_strong]:text-[#211f1b] [&_td]:border-[#d4cfc3] [&_th]:border-[#d4cfc3] [&_th]:bg-[#ded9cd]"
          content={content}
        />
      </article>
      <aside className="border-t border-hairline bg-surface-1 p-3 lg:border-l lg:border-t-0">
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
    const stored = Number(window.localStorage.getItem(key));
    if (Number.isFinite(stored) && stored >= min && stored <= max) {
      const frame = window.requestAnimationFrame(() => setValue(stored));
      return () => window.cancelAnimationFrame(frame);
    }
  }, [key, max, min]);

  const update = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(min, Number(next.toFixed(2))));
      setValue(clamped);
      window.localStorage.setItem(key, String(clamped));
    },
    [key, max, min],
  );

  return [value, update] as const;
}

function artifactStatusTone(status: string) {
  if (isArtifactAvailable(status)) {
    return "success" as const;
  }
  if (status === "failed") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function isArtifactAvailable(status: string) {
  return status === "available";
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
