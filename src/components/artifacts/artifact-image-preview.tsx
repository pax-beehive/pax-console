"use client";

import type { Dispatch, SetStateAction } from "react";
import { Minus, Plus, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ArtifactImageState = {
  width?: number;
  height?: number;
  // Undefined means fit to the viewport; a number means original-size scale.
  zoom?: number;
  failed?: boolean;
};

type ImageStateProps = {
  state: ArtifactImageState;
  onChange: Dispatch<SetStateAction<ArtifactImageState>>;
};

function ArtifactImageControls({ state, onChange }: ImageStateProps) {
  const changeZoom = (delta: number) =>
    onChange((current) => ({
      ...current,
      zoom: Math.min(4, Math.max(0.25, (current.zoom ?? 1) + delta)),
    }));

  return (
    <div className="flex shrink-0 items-center gap-0.5" aria-label="Image zoom">
      <Button
        aria-label="Zoom out"
        disabled={!state.width || state.zoom === 0.25}
        icon={<Minus className="h-4 w-4" />}
        onClick={() => changeZoom(-0.25)}
        size="icon"
        tooltip="Zoom out"
        type="button"
        variant="ghost"
      />
      <Button
        aria-label="Show image at actual size"
        disabled={!state.width}
        onClick={() => onChange((current) => ({ ...current, zoom: 1 }))}
        size="sm"
        type="button"
        variant="ghost"
      >
        {state.zoom ? `${Math.round(state.zoom * 100)}%` : "Fit"}
      </Button>
      <Button
        aria-label="Zoom in"
        disabled={!state.width || state.zoom === 4}
        icon={<Plus className="h-4 w-4" />}
        onClick={() => changeZoom(0.25)}
        size="icon"
        tooltip="Zoom in"
        type="button"
        variant="ghost"
      />
      <Button
        aria-label="Fit image"
        icon={<Scan className="h-4 w-4" />}
        onClick={() => onChange((current) => ({ ...current, zoom: undefined }))}
        size="icon"
        tooltip="Fit image"
        type="button"
        variant="ghost"
      />
    </div>
  );
}

export function ArtifactImagePreview({
  state,
  onChange,
  src,
  title,
  fillHeight,
}: ImageStateProps & { src: string; title: string; fillHeight: boolean }) {
  if (state.failed) {
    return (
      <div
        className="grid min-h-44 place-items-center p-6 text-center text-xs text-warning"
        role="alert"
      >
        This image could not be displayed. Retry preview or download the file.
      </div>
    );
  }

  return (
    <div className={cn("flex min-h-80 flex-col", fillHeight && "h-full")}>
      <div
        aria-label="Image canvas"
        className={cn(
          "flex h-80 overflow-auto bg-canvas p-3",
          fillHeight && "min-h-0 flex-1",
        )}
      >
        {/* Blob images use their decoded dimensions for fit and original-size zoom. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={title}
          className={cn(
            "m-auto block h-auto w-auto shrink-0 object-contain",
            state.zoom ? "max-w-none" : "max-h-full max-w-full",
          )}
          decoding="async"
          onError={() => onChange((current) => ({ ...current, failed: true }))}
          onLoad={(event) => {
            const image = event.currentTarget;
            onChange((current) => ({
              ...current,
              width: image.naturalWidth,
              height: image.naturalHeight,
            }));
          }}
          referrerPolicy="no-referrer"
          src={src}
          style={
            state.zoom && state.width && state.height
              ? {
                  width: state.width * state.zoom,
                  height: state.height * state.zoom,
                }
              : undefined
          }
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-2 py-1">
        <span className="px-1 text-xs text-ink-subtle">
          {state.width && state.height
            ? `${state.width} × ${state.height}`
            : "Loading image…"}
        </span>
        <ArtifactImageControls state={state} onChange={onChange} />
      </div>
    </div>
  );
}
