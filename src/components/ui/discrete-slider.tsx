"use client";

import { useState, type CSSProperties } from "react";
import { useStore } from "zustand";
import { createDiscreteSliderStore } from "@/stores/discrete-slider-store";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import styles from "./discrete-slider.module.css";

export type DiscreteSliderOption = { value: string; label: string };
export type DiscreteSliderProps = {
  options: readonly DiscreteSliderOption[];
  value: string;
  onValueChange?: (value: string) => void;
  onValueCommit?: (value: string) => void;
  disabled?: boolean;
  "aria-label": string;
  "aria-describedby"?: string;
  className?: string;
};

const adjustmentKeys = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/**
 * A shared, discrete range, not a progress meter. Labels are supplied translated.
 * Pointer and keyboard changes preview locally and notify onValueChange; commit
 * only at the end of a changed gesture. Cancelling restores the starting value.
 * After commit, the parent value remains authoritative: list controls snap back
 * until a save succeeds, while controlled editor drafts can follow each preview.
 */
export function DiscreteSlider({
  options,
  value,
  onValueChange,
  onValueCommit,
  disabled = false,
  "aria-label": label,
  "aria-describedby": description,
  className,
}: DiscreteSliderProps) {
  const [store] = useState(createDiscreteSliderStore);
  const { preview } = useStore(store);
  const unavailable = disabled || options.length < 2;
  const controlledIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const controlledValue = options[controlledIndex]?.value ?? "";
  const displayed = preview ?? controlledValue;
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === displayed),
  );
  const count = Math.max(options.length, 1);
  const variables = {
    "--stop-count": count,
    "--rail-inset": `${50 / count}%`,
    "--rail-width": `${(100 * (count - 1)) / count}%`,
  } as CSSProperties;

  function begin(kind: "pointer" | "keyboard", pointerId?: number) {
    if (unavailable || store.getState().interaction) return;
    store.setState({
      interaction: { kind, pointerId, origin: controlledValue },
      preview: controlledValue,
    });
  }
  function change(next: string) {
    const current = store.getState();
    if (unavailable || next === (current.preview ?? controlledValue)) return;
    if (current.interaction) store.setState({ preview: next });
    onValueChange?.(next);
    // Screen readers may adjust a native range without pointer/key events.
    if (!current.interaction) onValueCommit?.(next);
  }
  function finish(cancelled = false) {
    const { interaction, preview } = store.getState();
    if (!interaction) return;
    const next = preview ?? interaction.origin;
    store.setState({ interaction: undefined, preview: undefined });
    if (cancelled) {
      if (next !== interaction.origin) onValueChange?.(interaction.origin);
    } else if (!unavailable && next !== interaction.origin)
      onValueCommit?.(next);
  }
  function select(next: string) {
    if (unavailable || next === controlledValue) return;
    onValueChange?.(next);
    onValueCommit?.(next);
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(styles.root, className)}
      style={variables}
      aria-disabled={unavailable || undefined}
    >
      <div className={styles.labels}>
        {options.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant="ghost"
            className={styles.stop}
            aria-pressed={option.value === displayed}
            disabled={unavailable}
            onClick={() => select(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className={styles.rail}>
        <div className={styles.track} aria-hidden="true" />
        {options.map((option, stopIndex) => (
          <span
            key={option.value}
            aria-hidden="true"
            className={styles.tick}
            style={{ left: `${((stopIndex + 0.5) * 100) / count}%` }}
          />
        ))}
        <input
          type="range"
          min={0}
          max={Math.max(0, options.length - 1)}
          step={1}
          value={index}
          disabled={unavailable}
          aria-label={label}
          aria-describedby={description}
          aria-valuetext={options[index]?.label ?? ""}
          className={styles.range}
          onPointerDown={(event) => {
            if (
              unavailable ||
              event.button !== 0 ||
              store.getState().interaction
            )
              return;
            begin("pointer", event.pointerId);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={(event) => {
            const gesture = store.getState().interaction;
            if (
              gesture?.kind !== "pointer" ||
              gesture.pointerId !== event.pointerId
            )
              return;
            finish();
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={(event) => {
            const gesture = store.getState().interaction;
            if (
              gesture?.kind === "pointer" &&
              gesture.pointerId === event.pointerId
            )
              finish(true);
          }}
          onLostPointerCapture={(event) => {
            const gesture = store.getState().interaction;
            if (
              gesture?.kind === "pointer" &&
              gesture.pointerId === event.pointerId
            )
              finish(true);
          }}
          onChange={(event) => {
            const option = options[Number(event.currentTarget.value)];
            if (option) change(option.value);
          }}
          onKeyDown={(event) => {
            if (adjustmentKeys.has(event.key)) begin("keyboard");
            else if (
              event.key === "Escape" &&
              store.getState().interaction?.kind === "keyboard"
            ) {
              event.preventDefault();
              finish(true);
            }
          }}
          onKeyUp={(event) => {
            if (
              adjustmentKeys.has(event.key) &&
              store.getState().interaction?.kind === "keyboard"
            )
              finish();
          }}
          onBlur={() => {
            if (store.getState().interaction?.kind === "keyboard") finish();
          }}
        />
      </div>
    </div>
  );
}
