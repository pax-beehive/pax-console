"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type SettingsPage = { id: string; title: string };
const homePage: SettingsPage = { id: "home", title: "Session settings" };
const SettingsContext = createContext<{
  page: SettingsPage;
  navigate: (page: SettingsPage) => void;
  back: () => void;
  finish: () => void;
} | null>(null);
export function useSessionSettings() {
  return useContext(SettingsContext);
}
export function SessionSettingsHome({ children }: { children: ReactNode }) {
  const settings = useSessionSettings();
  return !settings || settings.page.id === "home" ? children : null;
}

export function SessionSettings({
  children,
  summary,
  trigger,
  initialPage = homePage,
}: {
  children: ReactNode;
  summary?: string;
  trigger?: ReactNode;
  initialPage?: SettingsPage;
}) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<SettingsPage[]>([initialPage]);
  const page = pages[pages.length - 1];
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const back = () =>
    setPages((current) =>
      current.length > 1 ? current.slice(0, -1) : current,
    );
  useLayoutEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page.id]);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setPages([initialPage]);
      }}
    >
      <Dialog.Trigger asChild>
        {trigger ?? (
          <Button
            aria-label="Session settings"
            variant="ghost"
            size="sm"
            type="button"
            className="min-w-0 max-w-64 shrink"
            icon={<SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />}
          >
            <span className="truncate text-xs">{summary}</span>
          </Button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex h-[min(34rem,85dvh)] flex-col overflow-hidden rounded-t-3xl border border-hairline bg-surface-2 pb-[env(safe-area-inset-bottom)] text-ink shadow-2xl shadow-black/40 outline-none sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[420px] sm:max-w-[calc(100vw-32px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            headingRef.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (pages.length > 1) {
              event.preventDefault();
              back();
            }
          }}
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-1 mt-2 h-1 w-9 shrink-0 rounded-full bg-hairline-strong sm:hidden"
          />
          <div className="flex min-h-16 shrink-0 items-center gap-2 border-b border-hairline px-4">
            {pages.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={
                  pages[pages.length - 2]?.id === "home"
                    ? "Back to settings"
                    : `Back to ${pages[pages.length - 2]?.title.toLowerCase()}`
                }
                onClick={back}
                icon={<ArrowLeft className="h-4 w-4" />}
              />
            )}
            <Dialog.Title
              ref={headingRef}
              tabIndex={-1}
              className="min-w-0 flex-1 text-base font-medium outline-none"
            >
              {page.title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close settings"
                icon={<X className="h-4 w-4" />}
              />
            </Dialog.Close>
          </div>
          <SettingsContext.Provider
            value={{
              page,
              navigate: (next) => setPages((current) => [...current, next]),
              back,
              finish: () => {
                setPages([initialPage]);
                if (initialPage.id !== "home") setOpen(false);
              },
            }}
          >
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
            >
              {children}
            </div>
          </SettingsContext.Provider>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
