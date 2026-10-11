/* @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "./client";
afterEach(() => vi.unstubAllGlobals());
it.each([
  [
    404,
    { error: "not_found" },
    "Requested API endpoint was not found (HTTP 404).",
  ],
  [
    503,
    { error: "region_unavailable" },
    "Your region is temporarily unavailable. Retry shortly (HTTP 503).",
  ],
  [500, { error: "private diagnostic" }, "PAX API request failed (HTTP 500)."],
  [400, { code: 400, message: "Invalid version" }, "Invalid version"],
])(
  "handles HTTP %s errors from both Worker and Manager envelopes",
  async (status, body, message) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json(body, { status: status as number })),
    );
    await expect(apiFetch("/api/v1/public/artifacts/download")).rejects.toThrow(
      message as string,
    );
  },
);
