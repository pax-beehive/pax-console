export type Region = "us" | "hk";
export type Bootstrap =
  | { status: "ready"; region: Region; user_id: string }
  | { status: "selection_required"; regions: Region[] };
export type RegionConfig =
  | { enabled: false }
  | { enabled: true; origin: string };
let regionalOrigin: string | undefined;
export const getRegionalOrigin = () => regionalOrigin;
async function json(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Your sign-in has expired. Sign in again to continue."
        : "Your region is temporarily unavailable. Please retry.",
    );
  return response.json();
}
export async function loadRegionConfig(): Promise<RegionConfig> {
  const data = await json("/api/region-config");
  if (data.enabled === false) {
    regionalOrigin = undefined;
    return { enabled: false };
  }
  if (data.enabled !== true || typeof data.origin !== "string")
    throw new Error("Region configuration is unavailable.");
  const origin = new URL(data.origin);
  if (origin.protocol !== "https:" || origin.origin !== data.origin)
    throw new Error("Region configuration is unavailable.");
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
