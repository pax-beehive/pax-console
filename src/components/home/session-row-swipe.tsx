"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const actionWidth = 88;
const movementThreshold = 8;
const revealThreshold = 40;

export function SessionRowSwipe({
  children,
  action,
  open,
  onOpenChange,
}: {
  children: ReactNode;
  action: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    initial: number;
    offset: number;
    horizontal: boolean;
    held: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const touchPointer = useRef(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const offset = dragOffset ?? (open ? actionWidth : 0);

  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={root} className="relative overflow-hidden" data-swipe-open={open}>
      {(open || offset > 0) && (
        <div
          aria-hidden={!open}
          inert={!open}
          className="absolute inset-y-0 right-0 flex w-[88px] items-stretch bg-surface-3"
        >
          {action}
        </div>
      )}
      <div
        className={cn(
          "relative touch-pan-y touch-pinch-zoom select-none bg-surface-1 [-webkit-touch-callout:none]",
          dragOffset === null &&
            "transition-transform duration-200 motion-reduce:transition-none",
        )}
        style={{ transform: `translateX(-${offset}px)` }}
        onPointerDown={(event) => {
          // A new press is a new action even if the prior swipe emitted no click.
          suppressClick.current = false;
          touchPointer.current =
            event.pointerType === "touch" || event.pointerType === "pen";
          if (
            !touchPointer.current ||
            !event.isPrimary ||
            (event.target as HTMLElement).closest("button")
          )
            return;
          clearTimer();
          const initial = open ? actionWidth : 0;
          gesture.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            initial,
            offset: initial,
            horizontal: false,
            held: false,
          };
          timer.current = setTimeout(() => {
            if (!gesture.current) return;
            gesture.current.held = true;
            suppressClick.current = true;
            onOpenChange(true);
          }, 450);
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (!current || current.id !== event.pointerId || current.held)
            return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.horizontal) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < movementThreshold)
              return;
            clearTimer();
            if (Math.abs(dy) >= Math.abs(dx)) {
              gesture.current = null;
              suppressClick.current = true;
              onOpenChange(false);
              return;
            }
            current.horizontal = true;
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }
          event.preventDefault();
          suppressClick.current = true;
          current.offset = Math.max(
            0,
            Math.min(actionWidth, current.initial - dx),
          );
          setDragOffset(current.offset);
        }}
        onPointerUp={(event) => {
          const current = gesture.current;
          if (!current || current.id !== event.pointerId) return;
          clearTimer();
          if (current.horizontal && !current.held)
            onOpenChange(current.offset >= revealThreshold);
          gesture.current = null;
          setDragOffset(null);
        }}
        onPointerCancel={() => {
          clearTimer();
          gesture.current = null;
          setDragOffset(null);
        }}
        onContextMenu={(event) => {
          if (touchPointer.current) event.preventDefault();
        }}
        onClickCapture={(event) => {
          if (suppressClick.current && event.detail !== 0) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          } else if (open) {
            event.preventDefault();
            event.stopPropagation();
            onOpenChange(false);
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
