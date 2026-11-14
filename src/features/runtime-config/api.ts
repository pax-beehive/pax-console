import { apiFetch } from "@/features/api/client";
import { ApiError } from "@/features/api/errors";
import type { Region } from "@/features/region/bootstrap";
import type {
  ConfigAuditPage,
  ConfigAuditQuery,
  ConfigEntry,
  ConfigSnapshot,
  ConfigTestRequest,
  ConfigTestResult,
  ConfigVersionRequest,
  ConfigWriteRequest,
} from "./types";

const root = "/api/v1/admin/config";

/**
 * The existing regional gateway resolves this selector, as it does for the
 * notification dashboard. Browser credentials and REST remain on /api/pax;
 * callers cannot supply a Manager origin. Each region authorizes the admin.
 */
function configPath(region: Region, suffix = "", params?: URLSearchParams) {
  const query = new URLSearchParams({ region });
  params?.forEach((value, key) => query.set(key, value));
  return `${root}${suffix}?${query}`;
}

export async function getConfig(region: Region, signal?: AbortSignal) {
  const snapshot = await apiFetch<ConfigSnapshot>(configPath(region), {
    signal,
    cache: "no-store",
  });
  // Never edit the home region accidentally when a gateway is missing the
  // selected-region routing support or returns a stale regional snapshot.
  if (snapshot.region !== region)
    throw new Error(
      "Runtime config response does not match the selected region",
    );
  return snapshot;
}

/** Direct async writes keep write-only secrets out of MutationCache. */
export function setConfig(
  region: Region,
  key: string,
  request: ConfigWriteRequest,
) {
  return apiFetch<ConfigEntry>(
    configPath(region, `/${encodeURIComponent(key)}`),
    {
      method: "PUT",
      body: JSON.stringify(request),
      cache: "no-store",
    },
  );
}

export function resetConfig(
  region: Region,
  key: string,
  request: ConfigVersionRequest,
) {
  const query = new URLSearchParams({
    expected_version: String(request.expected_version),
    reason: request.reason,
  });
  return apiFetch<ConfigEntry>(
    configPath(region, `/${encodeURIComponent(key)}`, query),
    { method: "DELETE", cache: "no-store" },
  );
}

export function testConfig(region: Region, request: ConfigTestRequest) {
  return apiFetch<ConfigTestResult>(configPath(region, "/test"), {
    method: "POST",
    body: JSON.stringify(request),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

export function getConfigAudit(
  region: Region,
  request: ConfigAuditQuery = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  if (request.key) query.set("key", request.key);
  if (request.cursor) query.set("cursor", request.cursor);
  query.set("limit", String(request.limit ?? 50));
  return apiFetch<ConfigAuditPage>(configPath(region, "/audit", query), {
    signal,
    cache: "no-store",
  });
}

export function revertConfig(
  region: Region,
  id: number,
  request: ConfigVersionRequest,
) {
  return apiFetch<ConfigEntry>(configPath(region, `/audit/${id}/revert`), {
    method: "POST",
    body: JSON.stringify(request),
    cache: "no-store",
  });
}

export type ConfigErrorDetails = {
  status?: number;
  code?: string;
  version?: number;
  fieldErrors?: Record<string, string>;
};

/** Read the contract's data.error/field_errors without displaying raw bodies. */
export function configErrorDetails(error: unknown): ConfigErrorDetails {
  if (!(error instanceof ApiError)) return {};
  const result: ConfigErrorDetails = { status: error.status };
  if (!error.body || typeof error.body !== "object" || !("data" in error.body))
    return result;
  const data = error.body.data;
  if (!data || typeof data !== "object") return result;
  const details = data as Record<string, unknown>;
  result.code = typeof details.error === "string" ? details.error : undefined;
  result.version =
    typeof details.version === "number" ? details.version : undefined;
  if (
    details.field_errors &&
    typeof details.field_errors === "object" &&
    !Array.isArray(details.field_errors) &&
    Object.values(details.field_errors).every(
      (value) => typeof value === "string",
    )
  )
    result.fieldErrors = details.field_errors as Record<string, string>;
  return result;
}
