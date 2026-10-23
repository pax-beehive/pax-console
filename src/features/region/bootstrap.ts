import { AuthError } from "@/features/api/errors";

export type Region = "us" | "hk";
export type Bootstrap =
  | { status: "ready"; region: Region; user_id: string; origin?: string }
  | { status: "selection_required"; regions: Region[] };
export type RegionConfig =
  | { enabled: false }
  | {
      enabled: true;
      origin: string;
      mode?: "direct";
      region?: Region;
      origins?: Record<Region, string>;
      entry?: boolean;
    };
let authoritativeReturn = false;
let directOrigins: Record<Region, string> | undefined;
export const isDirectRegion = () => directOrigins !== undefined;
const rememberedRegionKey = "pax:account-region";
export function rememberedRegionOrigin(
  config: RegionConfig,
): string | undefined {
  if (
    authoritativeReturn ||
    !config.enabled ||
    config.mode !== "direct" ||
    !config.entry ||
    !config.origins
  )
    return;
  try {
    const region = localStorage.getItem(rememberedRegionKey);
    if (region === "us" || region === "hk") return config.origins[region];
  } catch {
    /* Browser storage is only a navigation hint. */
  }
}
export function navigateToRegion(origin: string) {
  const url = new URL(
    window.location.pathname + window.location.search + window.location.hash,
    origin,
  );
  // Bypass a stale entry-origin hint when another region has resolved the account.
  // This flag grants no access: the destination still authenticates and bootstraps.
  url.searchParams.set("pax_region_return", "1");
  window.location.replace(url.href);
}
let regionalOrigin: string | undefined;
let assignedRegion: Region | undefined;
export const getAssignedRegion = () => assignedRegion;
export const getRegionalOrigin = () => regionalOrigin;
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 401) throw new AuthError();
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "Your sign-in has expired. Sign in again to continue."
        : "Your region is temporarily unavailable. Please retry.",
    );
  return response.json();
}
export async function loadRegionConfig(): Promise<RegionConfig> {
  directOrigins = undefined;
  const returning =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("pax_region_return") ===
      "1";
  authoritativeReturn ||= returning;
  if (returning) {
    const url = new URL(window.location.href);
    url.searchParams.delete("pax_region_return");
    window.history.replaceState(window.history.state, "", url);
  }
  const data = await json("/api/region-config");
  if (data.enabled === false) {
    regionalOrigin = undefined;
    assignedRegion = undefined;
    return { enabled: false };
  }
  if (data.enabled !== true || typeof data.origin !== "string")
    throw new Error("Region configuration is unavailable.");
  const origin = new URL(data.origin);
  if (origin.protocol !== "https:" || origin.origin !== data.origin)
    throw new Error("Region configuration is unavailable.");
  if (data.mode === "direct") {
    if (
      !["us", "hk"].includes(data.region) ||
      !data.origins ||
      !["us", "hk"].every((region) => {
        try {
          const candidate = new URL(data.origins[region]);
          return (
            candidate.protocol === "https:" &&
            candidate.origin === data.origins[region] &&
            !candidate.username &&
            !candidate.password
          );
        } catch {
          return false;
        }
      }) ||
      data.origins.us === data.origins.hk ||
      data.origins[data.region] !== data.origin
    )
      throw new Error("Region configuration is unavailable.");
    directOrigins = { us: data.origins.us, hk: data.origins.hk };
    return {
      enabled: true,
      mode: "direct",
      region: data.region,
      origin: data.origin,
      origins: directOrigins,
      entry: data.entry === true,
    };
  }
  return { enabled: true, origin: data.origin };
}
export async function bootstrapRegion(region?: Region): Promise<Bootstrap> {
  const data = await json("/api/v1/region/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(region ? { preferred_region: region } : {}),
  });
  if (
    data.status === "selection_required" &&
    Array.isArray(data.regions) &&
    data.regions.length === 2 &&
    data.regions.includes("us") &&
    data.regions.includes("hk")
  )
    return data;
  if (
    data.status !== "ready" ||
    !["us", "hk"].includes(data.region) ||
    typeof data.user_id !== "string" ||
    !/^usr_[A-Za-z0-9_-]+$/.test(data.user_id)
  )
    throw new Error("Unable to restore your account region.");
  if (directOrigins) {
    const origin = directOrigins[data.region as Region];
    if (data.origin !== origin)
      throw new Error("Invalid account region destination.");
    assignedRegion = data.region;
    try {
      localStorage.setItem(rememberedRegionKey, data.region);
    } catch {
      /* Storage is optional. */
    }
    regionalOrigin = origin;
    return {
      status: "ready",
      user_id: data.user_id,
      region: data.region,
      origin,
    };
  }
  assignedRegion = data.region;
  regionalOrigin = window.location.origin;
  return data;
}
export async function measureRegions(): Promise<{
  us: number | null;
  hk: number | null;
  recommended: Region | null;
}> {
  const measure = async (region: Region) => {
    try {
      const timings = [];
      for (let i = 0; i < 2; i++) {
        const nonce = crypto.randomUUID();
        const start = performance.now();
        const result = await json(
          `/api/v1/region/probe/${region}?nonce=${nonce}`,
        );
        if (result.region !== region || result.nonce !== nonce)
          throw new Error("Invalid region probe");
        timings.push(performance.now() - start);
      }
      return Math.round(Math.min(...timings));
    } catch {
      return null;
    }
  };
  const [us, hk] = await Promise.all([measure("us"), measure("hk")]);
  return {
    us,
    hk,
    recommended:
      us === null
        ? hk === null
          ? null
          : "hk"
        : hk === null || us <= hk
          ? "us"
          : "hk",
  };
}
