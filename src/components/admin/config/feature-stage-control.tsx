"use client";

import { DiscreteSlider } from "@/components/ui/discrete-slider";
import { useI18n } from "@/features/i18n/use-i18n";
import type { FeatureStage } from "@/features/runtime-config";
import { stages } from "./config-display";

/** Parents translate and render the scope description alongside their summary. */
export const featureStageDescriptions = {
  off: "Unavailable to all users, including administrators.",
  admin: "Available to administrators only.",
  beta: "Available to administrators and users on the beta list.",
  ga: "Available to all signed-in users.",
} as const satisfies Record<FeatureStage, string>;

type FeatureStageControlProps = {
  value: FeatureStage;
  onValueChange?: (value: FeatureStage) => void;
  onValueCommit?: (value: FeatureStage) => void;
  disabled?: boolean;
  label?: string;
  "aria-describedby"?: string;
  className?: string;
};

/** Shared four-stage scope rail for list previews and controlled editor drafts. */
export function FeatureStageControl({
  value,
  onValueChange,
  onValueCommit,
  disabled,
  label,
  "aria-describedby": description,
  className,
}: FeatureStageControlProps) {
  const { t } = useI18n();
  const options = (Object.keys(stages) as FeatureStage[]).map((stage) => ({
    value: stage,
    label: t(stages[stage]),
  }));
  return (
    <DiscreteSlider
      options={options}
      value={value}
      onValueChange={
        onValueChange
          ? (value) => onValueChange(value as FeatureStage)
          : undefined
      }
      onValueCommit={
        onValueCommit
          ? (value) => onValueCommit(value as FeatureStage)
          : undefined
      }
      disabled={disabled}
      aria-label={label ?? t("Feature stage")}
      aria-describedby={description}
      className={className}
    />
  );
}
