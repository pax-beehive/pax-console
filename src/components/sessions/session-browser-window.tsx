"use client";

import { useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NodeBrowserViewer } from "@/components/resources/node-browser-control";
import { NodeBrowserVNC } from "@/components/resources/node-browser-vnc";

export function SessionBrowserWindow({
  nodeId,
  userId,
  onClose,
}: {
  nodeId: string;
  userId: string;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [source, setSource] = useState<"native" | "docker">("native");
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const windowRef = useRef<HTMLElement>(null);
  const drag = useRef<
    { x: number; y: number; left: number; top: number } | undefined
  >(undefined);
  function startDrag(event: PointerEvent<HTMLElement>) {
    if (
      expanded ||
      (event.target as HTMLElement).closest("button") ||
      event.button !== 0
    )
      return;
    const rect = windowRef.current!.getBoundingClientRect();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!drag.current || !windowRef.current) return;
    const rect = windowRef.current.getBoundingClientRect();
    setPosition({
      left: Math.max(
        0,
        Math.min(
          window.innerWidth - rect.width,
          drag.current.left + event.clientX - drag.current.x,
        ),
      ),
      top: Math.max(
        0,
        Math.min(
          window.innerHeight - rect.height,
          drag.current.top + event.clientY - drag.current.y,
        ),
      ),
    });
  }
  return createPortal(
    <section
      ref={windowRef}
      role="region"
      aria-label="Session browser preview"
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-2xl"
      style={
        expanded
          ? { inset: 12 }
          : {
              width: "min(640px, calc(100vw - 24px))",
              height: "min(480px, 55dvh)",
              minWidth: "min(300px, calc(100vw - 24px))",
              minHeight: 220,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "calc(100dvh - 24px)",
              resize: "both",
              ...(position ? position : { right: 12, bottom: 80 }),
            }
      }
    >
      <header
        className="flex shrink-0 touch-none items-center justify-between gap-2 border-b border-hairline px-3 py-2"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
      >
        <span className="text-sm font-medium">Browser preview</span>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={
              expanded ? "Restore browser window" : "Expand browser window"
            }
            tooltip={expanded ? "Restore window" : "Expand window"}
            icon={
              expanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )
            }
            onClick={() => setExpanded(!expanded)}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label="Close browser preview"
            tooltip="Close preview"
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
          />
        </div>
      </header>
      <div
        className="flex shrink-0 gap-2 border-b border-hairline px-3 py-2"
        role="group"
        aria-label="Browser source"
      >
        <Button
          variant={source === "native" ? "primary" : "secondary"}
          className="min-h-11 flex-1 justify-center sm:min-h-9"
          aria-pressed={source === "native"}
          onClick={() => setSource("native")}
        >
          Native Chrome
        </Button>
        <Button
          variant={source === "docker" ? "primary" : "secondary"}
          className="min-h-11 flex-1 justify-center sm:min-h-9"
          aria-pressed={source === "docker"}
          onClick={() => setSource("docker")}
        >
          Docker desktop
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {source === "native" ? (
          <NodeBrowserViewer
            key={`${userId}/${nodeId}`}
            userId={userId}
            nodeId={nodeId}
          />
        ) : (
          <NodeBrowserVNC
            key={`${userId}/${nodeId}`}
            userId={userId}
            nodeId={nodeId}
            autoConnect
          />
        )}
      </div>
    </section>,
    document.body,
  );
}
