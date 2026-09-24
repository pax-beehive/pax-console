import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Next development origins", () => {
  it("allows the paxworkspace Console verification host", () => {
    expect(nextConfig.allowedDevOrigins?.slice(0, 2)).toEqual([
      "paxworkspace.net",
      "*.console-dev.paxworkspace.net",
    ]);
  });
});
