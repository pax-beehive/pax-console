import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const apiFetch = vi.fn();

vi.mock("./client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));

const { listAgentSessions, toPaxdConnectPreview } = await import("./resources");

afterEach(() => {
  apiFetch.mockReset();
});

describe("toPaxdConnectPreview", () => {
  it("maps node registration network and request fields for the connect page", () => {
    const preview = toPaxdConnectPreview({
      created_at: "2026-06-22T04:00:00Z",
      network: {
        city: "San Francisco",
        country: "United States",
        ip_address: "203.0.113.10",
      },
      pair_code: "ABC123",
      registration_id: "nreg_1",
      request: {
        api_endpoint: "https://api.paxtech.net",
        arch: "arm64",
        hostname: "workstation.local",
        machine_type: "mac",
        os: "darwin",
        paxd_version: "0.1.2",
      },
      status: "pending",
    });

    expect(preview).toEqual({
      apiEndpoint: "https://api.paxtech.net",
      arch: "arm64",
      city: "San Francisco",
      country: "United States",
      hostname: "workstation.local",
      ipAddress: "203.0.113.10",
      machineType: "mac",
      os: "darwin",
      paxdVersion: "0.1.2",
      requestedAt: "2026-06-22T04:00:00Z",
    });
  });
});

describe("listAgentSessions", () => {
  it("returns an empty list when the sessions collection is missing (404)", async () => {
    apiFetch.mockRejectedValueOnce(new ApiError("not found", 404, null));

    await expect(listAgentSessions("u1", "n1", "a1")).resolves.toEqual({
      sessions: [],
    });
  });

  it("rethrows non-404 API errors", async () => {
    apiFetch.mockRejectedValueOnce(new ApiError("boom", 500, null));

    await expect(listAgentSessions("u1", "n1", "a1")).rejects.toMatchObject({
      status: 500,
    });
  });

  it("returns the sessions payload on success", async () => {
    apiFetch.mockResolvedValueOnce({ sessions: [{ id: "s1" }] });

    await expect(listAgentSessions("u1", "n1", "a1")).resolves.toEqual({
      sessions: [{ id: "s1" }],
    });
  });
});
