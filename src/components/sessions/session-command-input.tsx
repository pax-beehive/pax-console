"use client";

import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import type { SessionAvailableCommand } from "@/features/api/types";
import { cn } from "@/lib/utils";

type Props = Omit<ComponentProps<"textarea">, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  commands?: SessionAvailableCommand[];
};

export function SessionCommandInput({
  value,
  onValueChange,
  commands = [],
  onKeyDown,
  ...props
}: Props) {
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const [dismissedValue, setDismissedValue] = useState<string>();
  const [activeIndex, setActiveIndex] = useState(0);
  const token = /^\/([^\s/]*)$/.exec(value)?.[1];
  const matches =
    token === undefined
      ? []
      : commands.filter((command) =>
          command.name.toLowerCase().startsWith(token.toLowerCase()),
        );
  const open =
    focused &&
    !props.disabled &&
    dismissedValue !== value &&
    matches.length > 0;
  const index = Math.min(activeIndex, Math.max(0, matches.length - 1));
  const activeId = open ? `${listId}-${index}` : undefined;
  const selectedName = /^\/(\S+)\s/.exec(value)?.[1];
  const selected = commands.find((command) => command.name === selectedName);
  const hint =
    typeof selected?.input?.hint === "string" ? selected.input.hint : undefined;

  useEffect(() => {
    if (activeId)
      document.getElementById(activeId)?.scrollIntoView?.({
        block: "nearest",
        inline: "nearest",
      });
  }, [activeId]);

  function select(command: SessionAvailableCommand) {
    onValueChange(`/${command.name} `);
    setActiveIndex(0);
    textareaRef.current?.focus();
  }

  return (
    <div
      className="relative min-w-0 max-w-full"
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      {open && (
        <div
          aria-label="Available commands"
          className="absolute inset-x-0 bottom-full z-20 mb-2 max-h-64 overflow-x-hidden overflow-y-auto rounded-lg border border-hairline bg-surface-1 p-1 shadow-lg"
          id={listId}
          role="listbox"
        >
          {matches.map((command, candidateIndex) => (
            <Button
              asChild
              aria-selected={candidateIndex === index}
              className={cn(
                "h-auto w-full min-w-0 max-w-full flex-col items-stretch gap-0.5 whitespace-normal px-3 py-2 text-left [overflow-wrap:anywhere]",
                candidateIndex === index && "bg-surface-2",
              )}
              id={`${listId}-${candidateIndex}`}
              key={command.name}
              onClick={() => select(command)}
              onMouseDown={(event) => event.preventDefault()}
              role="option"
              tabIndex={-1}
              type="button"
              variant="ghost"
            >
              <button type="button">
                <span className="break-all font-mono text-sm">
                  /{command.name}
                </span>
                <span className="text-xs font-normal text-ink-secondary">
                  {command.description}
                </span>
                {typeof command.input?.hint === "string" && (
                  <span className="text-xs font-normal text-ink-tertiary">
                    {command.input.hint}
                  </span>
                )}
              </button>
            </Button>
          ))}
        </div>
      )}
      <textarea
        {...props}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-describedby={hint ? `${listId}-hint` : undefined}
        aria-haspopup="listbox"
        aria-label={props["aria-label"] ?? "Message"}
        onChange={(event) => {
          setActiveIndex(0);
          setDismissedValue(undefined);
          onValueChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (
            open &&
            !event.shiftKey &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex(
                (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  matches.length) %
                  matches.length,
              );
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              select(matches[index]);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setDismissedValue(value);
              return;
            }
          }
          onKeyDown?.(event);
        }}
        ref={textareaRef}
        value={value}
      />
      {hint && (
        <div
          className="mb-2 px-1 text-xs text-ink-tertiary [overflow-wrap:anywhere]"
          id={`${listId}-hint`}
        >
          {hint}
        </div>
      )}
    </div>
  );
}
