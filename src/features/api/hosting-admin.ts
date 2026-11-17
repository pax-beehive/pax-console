import { apiFetch } from "./client";

/** Monthly model credit ledger; independent of optional sandbox lifecycle. */
export type HostingQuota = {
  granted_microusd: number;
  spent_microusd: number;
  reserved_microusd: number;
  remaining_microusd: number;
  granted_tokens: number;
  spent_tokens: number;
  reserved_tokens: number;
  remaining_tokens: number;
  period_start?: string;
  resets_at?: string;
};

export type HostingModelPolicy = {
  id: string;
  provider: string;
  upstream_model: string;
  moderation: "openai" | "off";
  policy_version: string;
  max_output_tokens: number;
  input_microusd_per_million: number;
  output_microusd_per_million: number;
  enabled: boolean;
};

export type HostingAdminUser = {
  user_id: string;
  environment_id: string;
  name: string;
  email?: string;
  access_paused: boolean;
  quota: HostingQuota;
  monthly_microusd: number;
  monthly_tokens: number;
};

export type HostingAdminRequest = {
  id: string;
  request_id: string;
  environment_id: string;
  user_id: string;
  model: string;
  provider: string;
  upstream_model: string;
  status: string;
  moderation_verdict: string;
  spent_microusd: number;
  reserved_microusd: number;
  tokens: number;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
  generation_started: boolean;
  upstream_request_id?: string;
  error_code?: string;
};

export type HostingAdminSnapshot = {
  revision: number;
  enabled: boolean;
  pool: {
    monthly_limit_microusd: number;
    spent_microusd: number;
    reserved_microusd: number;
    remaining_microusd: number;
    period_start: string;
    resets_at: string;
    available: boolean;
  };
  defaults: { monthly_microusd: number; monthly_tokens: number };
  users: HostingAdminUser[];
  users_next?: string;
  models: HostingModelPolicy[];
  model_bases: Record<string, string>;
  model_warnings?: Record<string, string>;
  requests: HostingAdminRequest[];
  requests_next?: string;
  audit: {
    actor_user_id: string;
    action: string;
    target_id: string;
    revision: number;
    created_at: string;
  }[];
};

export type HostingAdminFilter = {
  user_query?: string;
  users_after?: string;
  requests_before?: string;
  request_status?: string;
};

type Caps = { monthly_microusd: number; monthly_tokens: number };
export type HostingAdminFields =
  | { action: "pool"; monthly_microusd: number }
  | ({ action: "defaults" } & Caps)
  | ({
      action: "user";
      target_id: string;
      access_paused?: boolean;
    } & Partial<Caps>)
  | ({ action: "model"; target_id: string; expected_model_base: string } & Pick<
      HostingModelPolicy,
      | "enabled"
      | "moderation"
      | "max_output_tokens"
      | "input_microusd_per_million"
      | "output_microusd_per_million"
    >);
export type HostingAdminChange = { revision: number } & HostingAdminFields;

export const hostingAdminKey = (userId: string) =>
  ["hosting-admin", userId] as const;
const endpoint = "/api/v1/user/self/hosting-admin";

export function readHostingAdmin(
  filter: HostingAdminFilter,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ limit: "25" });
  for (const [key, value] of Object.entries(filter)) {
    if (value) params.set(key, value);
  }
  return apiFetch<HostingAdminSnapshot>(`${endpoint}?${params}`, { signal });
}

export function changeHostingAdmin(change: HostingAdminChange) {
  return apiFetch<HostingAdminSnapshot>(endpoint, {
    method: "PATCH",
    body: JSON.stringify(change),
  });
}

/** Parse dollars exactly: never round a budget or accept exponent notation. */
export function dollarsToMicrousd(value: string): number {
  const text = value.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(text)) {
    throw new Error(
      "Enter a nonnegative dollar amount with up to 6 decimal places.",
    );
  }
  const [whole, fraction = ""] = text.split(".");
  const result =
    BigInt(whole) * BigInt(1_000_000) + BigInt(fraction.padEnd(6, "0"));
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Dollar amount is too large.");
  }
  return Number(result);
}

export function parseTokenLimit(value: string, minimum = 0): number {
  const text = value.trim();
  const result = Number(text);
  if (
    !/^\d+$/.test(text) ||
    !Number.isSafeInteger(result) ||
    result < minimum
  ) {
    throw new Error(
      minimum > 0
        ? "Enter a positive whole token limit."
        : "Enter a nonnegative whole token limit.",
    );
  }
  return result;
}

export function microusdToDollars(value: number) {
  if (!Number.isSafeInteger(value)) return "";
  const sign = value < 0 ? "-" : "";
  const absolute = BigInt(Math.abs(value));
  const whole = absolute / BigInt(1_000_000);
  const fraction = String(absolute % BigInt(1_000_000))
    .padStart(6, "0")
    .replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function formatHostingDollars(value: number) {
  const exact = microusdToDollars(value);
  if (!exact) return "Unavailable";
  const [whole, fraction = ""] = exact.split(".");
  return `$${whole}.${fraction.padEnd(2, "0")}`;
}

export function formatHostingBudgetReset(start?: string, end?: string) {
  if (!start || !end) return null;
  const periodStart = new Date(start);
  const resetsAt = new Date(end);
  if (
    !Number.isFinite(periodStart.getTime()) ||
    !Number.isFinite(resetsAt.getTime()) ||
    periodStart.getUTCFullYear() <= 1 ||
    resetsAt.getTime() <= periodStart.getTime()
  )
    return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(resetsAt);
}
