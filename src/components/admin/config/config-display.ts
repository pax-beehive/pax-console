import type { ConfigEntry, FeatureValue } from "@/features/runtime-config";

export const stages = {
  off: "Off",
  admin: "Admin only",
  beta: "Beta",
  ga: "General availability",
} as const;
export const sources = {
  db: "Admin override",
  env: "Environment variable",
  default: "Default",
} as const;
export const featureLabels: Record<string, string> = {
  "feature.secretary": "Secretary",
  "feature.notifications": "Notifications",
  "feature.collaboration": "Collaboration",
  "feature.knowledge_capsules": "Knowledge capsules",
  "feature.browser_control": "Browser control",
  "feature.android_control": "Android control",
  "feature.voice_input": "Voice input",
};
export function featureValue(entry: ConfigEntry): FeatureValue {
  const value = entry.value as Partial<FeatureValue> | null;
  return {
    stage: value?.stage ?? "off",
    beta_emails: value?.beta_emails ?? [],
  };
}
export function displayValue(entry: ConfigEntry) {
  if (entry.secret) return entry.display;
  if (entry.type === "feature") return stages[featureValue(entry).stage];
  return entry.display ?? (entry.value == null ? null : String(entry.value));
}
