"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ArtifactViewerShell } from "@/components/artifacts/artifact-viewer-shell";
import {
  artifactDocumentFromSessionArtifact,
  artifactPreviewPageHref,
  primaryArtifactContent,
  type ArtifactPreviewDescriptor,
} from "@/components/artifacts/artifact-document";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonoId, TruncatedText } from "@/components/ui/text";
import type { SessionArtifact } from "@/features/api/types";
import { compactId } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SessionArtifactsPanel({
  artifacts,
  downloadHref,
  isLoading,
  onLoadPreview,
  onRefresh,
}: {
  artifacts: SessionArtifact[];
  downloadHref: (artifact: SessionArtifact, ref: string) => string;
  isLoading: boolean;
  onLoadPreview: (
    artifact: SessionArtifact,
  ) => Promise<ArtifactPreviewDescriptor>;
  onRefresh: () => void;
}) {
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const selectedArtifact = artifacts.find(
    (artifact) => artifact.artifact_id === selectedArtifactId,
  );
  const showingPreview = previewOpen && Boolean(selectedArtifact);
  const listRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement | null>(null);
  const listScrollTopRef = useRef(0);

  useLayoutEffect(() => {
    if (showingPreview) {
      backRef.current?.querySelector("button")?.focus({ preventScroll: true });
    } else if (selectedRowRef.current?.isConnected) {
      if (listRef.current) listRef.current.scrollTop = listScrollTopRef.current;
      selectedRowRef.current.focus({ preventScroll: true });
    }
  }, [showingPreview]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        hidden={showingPreview}
        className="min-h-0 flex-1 overflow-y-auto p-4"
        ref={listRef}
        role="region"
        aria-label="Artifact list"
      >
        <div className="mb-4 flex min-w-0 items-center gap-2">
          <Button
            aria-label="Refresh artifacts"
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={onRefresh}
            size="icon"
            tooltip="Refresh artifacts"
            type="button"
            variant="ghost"
          />
          <div className="min-w-0 flex-1" />
          <Badge className="font-mono">{String(artifacts.length)}</Badge>
        </div>

        <section className="grid gap-2">
          {isLoading && (
            <div className="text-xs text-ink-tertiary">Loading artifacts</div>
          )}
          {artifacts.map((artifact) => {
            const content = primaryArtifactContent(artifact);
            const selected = artifact.artifact_id === selectedArtifactId;
            return (
              <button
                className={cn(
                  "grid min-w-0 gap-2 rounded-lg border p-2 text-left transition",
                  selected
                    ? "border-primary-focus bg-surface-3"
                    : "border-hairline bg-canvas hover:border-hairline-strong",
                )}
                key={artifact.artifact_id}
                aria-label={`Open artifact: ${artifactTitle(artifact)}`}
                aria-current={selected ? "true" : undefined}
                onClick={(event) => {
                  listScrollTopRef.current = listRef.current?.scrollTop ?? 0;
                  selectedRowRef.current = event.currentTarget;
                  setSelectedArtifactId(artifact.artifact_id);
                  setPreviewOpen(true);
                }}
                type="button"
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0">
                    <TruncatedText className="text-sm font-medium text-ink">
                      {artifactTitle(artifact)}
                    </TruncatedText>
                    <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-ink-tertiary">
                      <span className="shrink-0">{artifact.kind}</span>
                      {content?.size_bytes ? (
                        <span className="shrink-0">
                          {formatBytes(content.size_bytes)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ChevronRight
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-ink-tertiary"
                  />
                </div>
                {content?.filename && (
                  <MonoId tooltip={content.filename}>{content.filename}</MonoId>
                )}
              </button>
            );
          })}
          {!isLoading && artifacts.length === 0 && (
            <div className="rounded-lg border border-dashed border-hairline bg-canvas p-2 text-xs text-ink-tertiary">
              No artifacts for this session
            </div>
          )}
        </section>
      </div>
      {showingPreview && selectedArtifact && (
        <>
          <div
            ref={backRef}
            className="shrink-0 border-b border-hairline px-3 py-2"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => setPreviewOpen(false)}
            >
              Back to artifacts
            </Button>
          </div>
          <div
            key={selectedArtifact.artifact_id}
            className="min-h-0 flex-1 overflow-y-auto p-4"
          >
            <ArtifactViewerShell
              autoLoad
              key={selectedArtifact.artifact_id}
              artifact={artifactDocumentFromSessionArtifact(
                selectedArtifact,
                downloadHref(
                  selectedArtifact,
                  primaryArtifactContent(selectedArtifact)?.ref ?? "main",
                ),
              )}
              loadPreview={() => onLoadPreview(selectedArtifact)}
              viewerHref={artifactPreviewPageHref(
                "session_artifact",
                selectedArtifact.artifact_id,
                primaryArtifactContent(selectedArtifact)?.ref ?? "main",
              )}
            />
          </div>
        </>
      )}
    </div>
  );
}

function artifactTitle(artifact: SessionArtifact) {
  return (
    artifact.title ||
    primaryArtifactContent(artifact)?.filename ||
    compactId(artifact.artifact_id)
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}
