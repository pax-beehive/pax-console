import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const apiFetch = vi.fn();

vi.mock("./client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));

const {
  createEnvelope,
  createKnowledgeCapsule,
  createTeamInvite,
  injectKnowledgeCapsule,
  listAgentSessions,
  listEnvelopes,
  listFriends,
  listKnowledgeCapsules,
  listTeams,
  toPaxdConnectPreview,
} = await import("./resources");

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

describe("collaboration resources", () => {
  it("lists teams through the user-scoped PAX API path", async () => {
    apiFetch.mockResolvedValueOnce({ teams: [] });

    await listTeams("usr_1");

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/user/usr_1/teams");
  });

  it("creates team invites with an explicit member default role", async () => {
    apiFetch.mockResolvedValueOnce({ invite: { invite_id: "tinv_1" } });

    await createTeamInvite("usr_1", "team_1", "person@example.com");

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/user/usr_1/teams/team_1/invites", {
      body: JSON.stringify({ email: "person@example.com", role: "member" }),
      method: "POST",
    });
  });

  it("lists friends and envelopes with compact query filters", async () => {
    apiFetch.mockResolvedValueOnce({ friends: [] });
    apiFetch.mockResolvedValueOnce({ envelopes: [] });

    await listFriends("usr_1", { direction: "received", status: "accepted" });
    await listEnvelopes("usr_1", { direction: "sent", status: "" });

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/usr_1/friends?direction=received&status=accepted",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/envelopes?direction=sent",
    );
  });

  it("creates envelopes with a knowledge capsule payload", async () => {
    apiFetch.mockResolvedValueOnce({ envelope: { envelope_id: "env_1" } });
    const payload = { schema_version: "paxl.envelope_payload.knowledge_capsule.v2" };

    await createEnvelope("usr_1", {
      message: "handoff",
      payload_json: payload,
      recipient_email: "friend@example.com",
    });

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/user/usr_1/envelopes", {
      body: JSON.stringify({
        message: "handoff",
        payload_json: payload,
        payload_type: "knowledge_capsule",
        recipient_email: "friend@example.com",
      }),
      method: "POST",
    });
  });

  it("lists, creates, and injects knowledge capsules through session routes", async () => {
    apiFetch.mockResolvedValueOnce({ capsules: [] });
    apiFetch.mockResolvedValueOnce({ capsule: { capsule_id: "kcap_1" } });
    apiFetch.mockResolvedValueOnce({ injection: {}, message: {} });

    await listKnowledgeCapsules("usr_1", {
      keyword: "team",
      source_session_id: "sess_1",
      status: "active",
    });
    await createKnowledgeCapsule("usr_1", "sess_1", "team");
    await injectKnowledgeCapsule("usr_1", "sess_2", "kcap_1");

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/usr_1/knowledge-capsules?keyword=team&source_session_id=sess_1&status=active",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/sessions/sess_1/knowledge-capsules",
      {
        body: JSON.stringify({ keyword: "team" }),
        method: "POST",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/user/usr_1/sessions/sess_2/knowledge-injections",
      {
        body: JSON.stringify({ capsule_id: "kcap_1" }),
        method: "POST",
      },
    );
  });
});
