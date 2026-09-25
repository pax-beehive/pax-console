"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export function ComposerDropZone({
  children,
  className,
  disabledReason,
  onFiles,
}: {
  children: ReactNode;
  className?: string;
  disabledReason?: string;
  onFiles: (files: File[]) => Promise<void>;
}) {
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const reset = () => {
    depth.current = 0;
    setDragging(false);
  };
  const hasFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files");

  useEffect(() => {
    if (!dragging) return;
    const end = () => {
      depth.current = 0;
      setDragging(false);
    };
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, [dragging]);

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = disabledReason ? "none" : "copy";
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        reset();
        if (!disabledReason) void onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-2 rounded-[inherit] border border-accent/60 bg-surface-2/95 px-4 text-center text-sm text-ink shadow-[inset_0_0_0_1px_var(--color-accent)]"
          role="status"
        >
          <Upload aria-hidden="true" className="h-4 w-4 shrink-0" />
          {disabledReason ?? "Drop files to upload"}
        </div>
      )}
    </div>
  );
}
