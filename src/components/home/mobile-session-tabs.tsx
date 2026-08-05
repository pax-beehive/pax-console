"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  AnimatePresence,
  motion,
  Reorder,
  useDragControls,
  type PanInfo,
} from "motion/react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MobileSessionTabItem = {
  runStatus?: string;
  sessionId: string;
  title: string;
};

type MobileSessionTabsProps = {
  activeSessionId?: string;
  dismissedTitle?: string;
  items: MobileSessionTabItem[];
  onDismiss: (sessionId: string) => void;
  onNewSession: () => void;
  onReorder?: (sessionIds: string[]) => void;
  onSelect: (sessionId: string) => void;
  onUndoDismiss?: () => void;
};

export function MobileSessionTabs({
  activeSessionId,
  dismissedTitle,
  items,
  onDismiss,
  onNewSession,
  onReorder,
  onSelect,
  onUndoDismiss,
}: MobileSessionTabsProps) {
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const sessionIds = items.map((item) => item.sessionId);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView?.({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeSessionId]);

  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      aria-label="Open sessions"
      className="relative z-10 flex h-10 min-w-0 shrink-0 border-b border-hairline bg-surface-1 lg:hidden"
    >
      <Reorder.Group
        as="div"
        aria-orientation="horizontal"
        className="flex min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        axis="x"
        layoutScroll
        onReorder={onReorder ?? ignoreReorder}
        ref={tabListRef}
        role="tablist"
        values={sessionIds}
      >
        {items.map((item, index) => (
          <MobileSessionTab
            active={item.sessionId === activeSessionId}
            activeTabRef={activeTabRef}
            item={item}
            key={item.sessionId}
            onDismiss={onDismiss}
            onMove={(offset) => {
              const nextIndex = index + offset;
              if (!onReorder || nextIndex < 0 || nextIndex >= items.length) {
                return;
              }
              const reordered = [...sessionIds];
              const [moved] = reordered.splice(index, 1);
              reordered.splice(nextIndex, 0, moved);
              onReorder(reordered);
            }}
            onSelect={onSelect}
            scrollContainerRef={tabListRef}
          />
        ))}
      </Reorder.Group>

      <Button
        aria-label="Start new session"
        className="h-full w-10 shrink-0 rounded-none border-l border-hairline"
        icon={<Plus className="h-4 w-4" />}
        onClick={onNewSession}
        size="icon"
        tooltip="New session"
        type="button"
        variant="ghost"
      />

      <AnimatePresence>
        {dismissedTitle && onUndoDismiss && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="absolute right-2 top-full z-20 mt-2 flex max-w-[calc(100vw-1rem)] items-center gap-2 rounded-lg border border-hairline-strong bg-surface-2 px-3 py-2 shadow-xl"
            exit={{ opacity: 0, y: -4 }}
            initial={{ opacity: 0, y: -4 }}
          >
            <span className="min-w-0 truncate text-xs text-ink-muted">
              Closed {dismissedTitle}. Session keeps running.
            </span>
            <Button
              onClick={onUndoDismiss}
              size="sm"
              type="button"
              variant="ghost"
            >
              Undo
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

const longPressDurationMs = 350;
const scrollGestureThresholdPx = 6;

function ignoreReorder() {}

type MobileSessionTabProps = {
  active: boolean;
  activeTabRef: RefObject<HTMLDivElement | null>;
  item: MobileSessionTabItem;
  onDismiss: (sessionId: string) => void;
  onMove: (offset: -1 | 1) => void;
  onSelect: (sessionId: string) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
};

function MobileSessionTab({
  active,
  activeTabRef,
  item,
  onDismiss,
  onMove,
  onSelect,
  scrollContainerRef,
}: MobileSessionTabProps) {
  const dragControls = useDragControls();
  const longPressTimerRef = useRef<number | null>(null);
  const pointerStateRef = useRef<{
    nativeEvent: PointerEvent;
    pointerId: number;
    startScrollLeft: number;
    startX: number;
    startY: number;
  } | null>(null);
  const draggingRef = useRef(false);
  const scrollingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(
    () => () => {
      clearLongPressTimer(longPressTimerRef);
    },
    [],
  );

  function finishPointerGesture() {
    clearLongPressTimer(longPressTimerRef);
    pointerStateRef.current = null;
    scrollingRef.current = false;
    if (suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      (event.pointerType === "mouse" && event.button !== 0) ||
      (event.target as HTMLElement).closest("[data-tab-action]")
    ) {
      return;
    }

    const scrollContainer = scrollContainerRef.current;
    pointerStateRef.current = {
      nativeEvent: event.nativeEvent,
      pointerId: event.pointerId,
      startScrollLeft: scrollContainer?.scrollLeft ?? 0,
      startX: event.clientX,
      startY: event.clientY,
    };
    scrollingRef.current = false;
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    clearLongPressTimer(longPressTimerRef);
    longPressTimerRef.current = window.setTimeout(() => {
      const pointerState = pointerStateRef.current;
      if (!pointerState || scrollingRef.current) {
        return;
      }
      draggingRef.current = true;
      suppressClickRef.current = true;
      setDragging(true);
      dragControls.start(pointerState.nativeEvent);
      navigator.vibrate?.(10);
    }, longPressDurationMs);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointerState = pointerStateRef.current;
    if (
      !pointerState ||
      pointerState.pointerId !== event.pointerId ||
      draggingRef.current
    ) {
      return;
    }

    const deltaX = event.clientX - pointerState.startX;
    const deltaY = event.clientY - pointerState.startY;
    if (
      Math.abs(deltaX) < scrollGestureThresholdPx &&
      Math.abs(deltaY) < scrollGestureThresholdPx
    ) {
      return;
    }

    clearLongPressTimer(longPressTimerRef);
    if (Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    scrollingRef.current = true;
    suppressClickRef.current = true;
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft =
        pointerState.startScrollLeft - deltaX;
    }
    event.preventDefault();
  }

  function handleDrag(_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }
    const bounds = scrollContainer.getBoundingClientRect();
    if (info.point.x < bounds.left + 36) {
      scrollContainer.scrollLeft -= 12;
    } else if (info.point.x > bounds.right - 36) {
      scrollContainer.scrollLeft += 12;
    }
  }

  function handleDragEnd() {
    draggingRef.current = false;
    setDragging(false);
    finishPointerGesture();
  }

  function handlePointerCancel() {
    if (draggingRef.current) {
      dragControls.cancel();
      draggingRef.current = false;
      setDragging(false);
    }
    finishPointerGesture();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!event.altKey) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onMove(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      onMove(1);
    }
  }

  return (
    <Reorder.Item
      as="div"
      className={cn(
        "relative flex h-full min-w-[116px] max-w-[180px] shrink-0 select-none touch-pan-y items-center border-r border-hairline [-webkit-touch-callout:none]",
        active ? "bg-surface-2" : "bg-surface-1",
        dragging && "z-30 shadow-lg",
      )}
      data-reordering={dragging ? "true" : "false"}
      data-session-tab={item.sessionId}
      dragControls={dragControls}
      dragElastic={0.04}
      dragListener={false}
      onContextMenu={(event) => event.preventDefault()}
      onDrag={handleDrag}
      onDragEnd={handleDragEnd}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerGesture}
      ref={active ? activeTabRef : undefined}
      value={item.sessionId}
      whileDrag={{ scale: 1.03 }}
    >
      <button
        aria-label={item.title}
        aria-selected={active}
        className={cn(
          "h-full min-w-0 flex-1 truncate px-3 pr-1 text-left text-xs transition",
          active
            ? "font-medium text-ink"
            : "text-ink-tertiary hover:text-ink-muted",
        )}
        onClick={(event) => {
          if (suppressClickRef.current) {
            event.preventDefault();
            return;
          }
          onSelect(item.sessionId);
        }}
        onKeyDown={handleKeyDown}
        role="tab"
        title={`${item.title} · Long press and drag to reorder`}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <SessionActivityDot status={item.runStatus} />
          <span className="truncate">{item.title}</span>
        </span>
      </button>
      <button
        aria-label={`Close ${item.title} tab`}
        className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded text-ink-tertiary transition hover:bg-surface-3 hover:text-ink"
        data-tab-action
        onClick={() => onDismiss(item.sessionId)}
        title="Close tab; session keeps running"
        type="button"
      >
        <X className="h-3 w-3" />
      </button>
      {active && (
        <motion.span
          className="absolute inset-x-0 bottom-0 h-0.5 bg-accent"
          layoutId="mobile-active-session-tab"
        />
      )}
    </Reorder.Item>
  );
}

function clearLongPressTimer(timerRef: RefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function SessionActivityDot({ status }: { status?: string }) {
  if (status === "waiting_approval") {
    return (
      <span
        aria-label="Waiting for approval"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
        role="status"
      />
    );
  }
  if (status === "running" || status === "streaming") {
    return (
      <span
        aria-label="Running"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-bright"
        role="status"
      />
    );
  }
  return null;
}
