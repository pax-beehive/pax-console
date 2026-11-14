import type { Region } from "@/features/region/bootstrap";

export type FeatureStage = "off" | "admin" | "beta" | "ga";
export type FeatureValue = {
  stage: FeatureStage;
  beta_emails: string[];
};

export type ConfigValue = string | number | boolean | FeatureValue | null;
export type ConfigSource = "db" | "env" | "default";

/** The Manager registry supplies the editable fields; secret values are null. */
export type ConfigEntry = {
  key: string;
  kind: "feature" | "setting";
  group: string;
  label: string;
  description: string;
  type: "string" | "url" | "bool" | "int" | "duration" | "enum" | "feature";
  options: string[] | null;
  secret: boolean;
  value: ConfigValue;
  display: string | null;
  has_value: boolean;
  source: ConfigSource;
  env_var: string;
  default_display: string | null;
  apply: "live" | "restart";
  pending_restart: boolean;
  testable: boolean;
  version: number;
  updated_at: string | null;
  updated_by: string | null;
};

export type ConfigSnapshot = {
  region: Region;
  revision: number;
  vault_configured: boolean;
  health: {
    last_refresh_at: string | null;
    refresh_failures: number;
    degraded: boolean;
  };
  entries: ConfigEntry[];
};

export type ConfigWriteRequest = {
  value: ConfigValue;
  expected_version: number;
  reason: string;
};

export type ConfigVersionRequest = Omit<ConfigWriteRequest, "value">;

export type ConfigTestRequest = {
  group: string;
  overrides: Record<string, ConfigValue>;
};

export type ConfigTestResult = {
  ok: boolean;
  latency_ms: number;
  message: string;
};

export type ConfigAuditItem = {
  id: number;
  key: string;
  action: string;
  old_display: string | null;
  new_display: string | null;
  version: number;
  actor: string;
  reason: string;
  created_at: string;
  revertible: boolean;
};

export type ConfigAuditPage = {
  items: ConfigAuditItem[];
  next_cursor: string | null;
};

export type ConfigAuditQuery = {
  key?: string;
  cursor?: string;
  limit?: number;
};
