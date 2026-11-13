"use client";

import { useI18n } from "@/features/i18n/use-i18n";

import { useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NodeMobileViewer } from "@/components/resources/node-mobile-control";

export function SessionMobileWindow({
  nodeId,
  userId,
  onClose,
  onPrepare,
  prepareDisabled,
}: {
  nodeId: string;
  userId: string;
  onClose: () => void;
  // Adds preparation instructions to the existing chat draft for manual send.
  onPrepare?: () => Promise<boolean>;
  prepareDisabled?: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const windowRef = useRef<HTMLElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  function startDrag(event: PointerEvent<HTMLElement>) {
    if (
      expanded ||
      event.button !== 0 ||
      (event.target as HTMLElement).closest("button")
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
      aria-label={t("Session Android preview")}
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-2xl"
      style={
        expanded
          ? { inset: 12 }
          : {
              width: "min(480px, calc(100vw - 24px))",
              height: "min(760px, 75dvh)",
              minWidth: "min(300px, calc(100vw - 24px))",
              minHeight: 260,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "calc(100dvh - 24px)",
              resize: "both",
              ...(position ?? { right: 24, bottom: 88 }),
            }
      }
    >
      <header
        className="flex shrink-0 touch-none items-center justify-between gap-2 border-b border-hairline px-3 py-2"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Smartphone className="h-4 w-4" />
          {t("Android phone")}
        </span>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={
              expanded
                ? t("Restore Android window")
                : t("Expand Android window")
            }
            tooltip={expanded ? t("Restore window") : t("Expand window")}
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
            aria-label={t("Close Android preview")}
            icon={<X className="h-4 w-4" />}
            onClick={onClose}
          />
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <NodeMobileViewer
          key={`${userId}/${nodeId}`}
          nodeId={nodeId}
          userId={userId}
          onPrepare={onPrepare}
          prepareDisabled={prepareDisabled}
        />
      </div>
    </section>,
    document.body,
  );
}
