import { createStore } from "zustand/vanilla";

type SliderInteraction = {
  kind: "pointer" | "keyboard";
  origin: string;
  pointerId?: number;
};

/** Transient gesture previews only; the parent owns the selected value. */
export function createDiscreteSliderStore() {
  return createStore<{
    interaction?: SliderInteraction;
    preview?: string;
  }>(() => ({}));
}
