"use client";

import { MousePointer2 } from "lucide-react";
import type { BrowserFrame } from "@/features/browser-control/api";

export function BrowserPreviewImage({
  frame,
  onError,
}: {
  frame: BrowserFrame;
  onError: () => void;
}) {
  return (
    <>
      {/* Live pixels stay transient and do not pass through the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt="Current browser page"
        onError={onError}
        src={`data:image/jpeg;base64,${frame.image}`}
        className="block h-auto w-full"
        draggable={false}
      />
      {frame.pointer &&
        Number.isFinite(frame.pointer.x) &&
        Number.isFinite(frame.pointer.y) && (
          <span
            aria-label="Agent's recent interaction"
            className="pointer-events-none absolute text-violet-400"
            style={{
              left: `${(frame.pointer.x / frame.width) * 100}%`,
              top: `${(frame.pointer.y / frame.height) * 100}%`,
            }}
          >
            <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border-2 border-violet-400 bg-violet-400/20" />
            <MousePointer2
              aria-hidden="true"
              className="relative h-5 w-5 fill-violet-400 stroke-white drop-shadow"
            />
          </span>
        )}
    </>
  );
}
