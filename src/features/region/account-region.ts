import { getAssignedRegion } from "./bootstrap";

/**
 * English source name of the signed-in account's region, to pass through t().
 * Undefined when this deployment does not assign accounts to regions.
 */
export function accountRegionName() {
  const region = getAssignedRegion();
  if (region === "hk") return "Hong Kong";
  if (region === "us") return "United States";
  return undefined;
}
