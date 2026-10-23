type Region = "us" | "hk";
export type LoginTarget = {
  codes?: Partial<Record<Region, string>>;
  code?: string;
  target_region?: Region;
  admin?: boolean;
};

export function parseLoginTarget(
  params: Pick<URLSearchParams, "get" | "getAll">,
): LoginTarget {
  for (const key of ["code", "us_code", "hk_code", "region", "admin"]) {
    if (params.getAll(key).length > 1)
      throw new Error(
        "This login link is ambiguous. Request a new link from paxl.",
      );
  }
  const code = params.get("code") ?? "";
  const us = params.get("us_code"),
    hk = params.get("hk_code"),
    region = params.get("region"),
    admin = params.get("admin");
  if (region && region !== "us" && region !== "hk")
    throw new Error("Invalid login region.");
  if (admin && (admin !== "1" || !region))
    throw new Error("Administrator login requires an explicit region.");
  if (us !== null || hk !== null) {
    if (
      code ||
      region ||
      admin ||
      [us, hk].some((v) => v !== null && !/^[A-Z0-9]{6}$/.test(v))
    )
      throw new Error("Invalid regional login codes.");
    return { codes: { ...(us ? { us } : {}), ...(hk ? { hk } : {}) } };
  }
  if (code && !/^[A-Z0-9]{6}$/.test(code))
    throw new Error("Invalid login code.");
  return {
    code,
    ...(region ? { target_region: region as Region } : {}),
    ...(admin ? { admin: true } : {}),
  };
}

export async function confirmRegionalLogin(
  target: LoginTarget,
): Promise<{ status: string }> {
  const response = await fetch("/api/v1/region/paxl-login/approve", {
    method: "POST",
    credentials: "same-origin",
    redirect: "error",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target),
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.message ?? "Unable to confirm this login. Please retry.",
    );
  return body.data;
}
