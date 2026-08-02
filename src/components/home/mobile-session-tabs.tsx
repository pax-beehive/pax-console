"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
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
  onSelect: (sessionId: string) => void;
  onUndoDismiss?: () => void;
};

export function MobileSessionTabs({
  activeSessionId,
  dismissedTitle,
  items,
  onDismiss,
  onNewSession,
  onSelect,
  onUndoDismiss,
}: MobileSessionTabsProps) {
  const activeTabRef = useRef<HTMLDivElement | null>(null);

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
      <div
        aria-orientation="horizontal"
        className="flex min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {items.map((item) => {
          const active = item.sessionId === activeSessionId;
          return (
            <div
              className={cn(
                "relative flex h-full min-w-[116px] max-w-[180px] shrink-0 items-center border-r border-hairline",
                active ? "bg-surface-2" : "bg-surface-1",
              )}
              key={item.sessionId}
              ref={active ? activeTabRef : undefined}
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
                onClick={() => onSelect(item.sessionId)}
                role="tab"
                title={item.title}
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
            </div>
          );
        })}
      </div>

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
