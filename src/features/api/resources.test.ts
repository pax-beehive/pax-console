import { describe, expect, it } from "vitest";
import { toPaxdConnectPreview } from "./resources";

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
