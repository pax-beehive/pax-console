import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";

const apiFetch = vi.fn();

vi.mock("./client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));

const {
  archiveTeam,
  archiveProject,
  cancelTeamInvite,
  createEnvelope,
  createProject,
  createProjectTarget,
  createKnowledgeCapsule,
  createNodeDaemonAgentConnection,
  createTeamInvite,
  deleteQueuedSessionTurn,
  deleteAgent,
  deleteNode,
  deleteNodeAgent,
  discoverNodeDaemonHarnesses,
  flattenSessionHistoryPages,
  getAgent,
  getAgentPermissionCatalog,
  getProject,
  getProjectTarget,
  getNodeDaemonCommand,
  getLatestPaxdRelease,
  getNodeDaemonStatus,
  getQueuedSessionTurn,
  getUserSession,
  injectKnowledgeCapsule,
  listAgents,
  listAgentOwnerInfos,
  listAgentSessions,
  listEnvelopes,
  listFriends,
  listKnowledgeCapsules,
  listNodeDaemonAgentConnections,
  listNodeDaemonHarnesses,
  listProjects,
  listProjectTargets,
  listSessionHistory,
  listTeamAuditEvents,
  listTeams,
  listUserSessions,
  queueSessionTurn,
  removeNodeDaemonAgentConnection,
  resetSessionRuntime,
  restartNodeDaemon,
  restartNodeDaemonAgentConnection,
  startNodeDaemonAgentConnection,
  steerSessionTurn,
  stopNodeDaemonAgentConnection,
  stopSessionTurn,
  toPaxdConnectPreview,
  updateAgentSession,
  updateQueuedSessionTurn,
  updateNodeAgentProfile,
  updateNodeDaemonAgentConnection,
  updateNodeProfile,
  updateProject,
  updateProjectTarget,
  updateTeamMemberRole,
  uploadUserAttachmentFile,
  upgradeNodeDaemon,
} = await import("./resources");

afterEach(() => {
  apiFetch.mockReset();
  vi.unstubAllGlobals();
});

describe("uploadUserAttachmentFile", () => {
  it("uploads an S3 presigned ticket with the ticket headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 204,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image"], "image.png", { type: "image/png" });
    const ticketHeaders = {
      "Content-Type": "image/png",
      "x-amz-meta-sha256": "abc123",
    };

    await uploadUserAttachmentFile(
      {
        attachment: {
          attachment_id: "att_1",
          content_type: "image/png",
          filename: "image.png",
          upload_status: "pending",
        },
        upload: {
          headers: ticketHeaders,
          method: "PUT",
          protocol: "s3_presigned_put",
          url: "https://objects.example.test/presigned",
        },
      },
      file,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://objects.example.test/presigned");
    expect(init).toMatchObject({
      body: file,
      credentials: "omit",
      method: "PUT",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(init.headers).toBe(ticketHeaders);
  });

  it("redacts the signed URL when an S3 upload request fails", async () => {
    const signedUrl =
      "https://objects.example.test/private?X-Amz-Credential=client&X-Amz-Signature=top-secret";
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new TypeError(`Failed to fetch ${signedUrl}`));
    vi.stubGlobal("fetch", fetchMock);

    const upload = uploadUserAttachmentFile(
      {
        attachment: {
          attachment_id: "att_private",
          content_type: "image/png",
          filename: "private.png",
          upload_status: "pending",
        },
        upload: {
          method: "PUT",
          protocol: "s3_presigned_put",
          url: signedUrl,
        },
      },
      new File(["image"], "private.png", { type: "image/png" }),
    );

    await expect(upload).rejects.toThrow("Attachment upload request failed");
    await expect(upload).rejects.not.toThrow(signedUrl);
    await expect(upload).rejects.not.toThrow("top-secret");
  });

  it("treats S3 412 as an ambiguous stored success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 412,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadUserAttachmentFile(
        {
          attachment: {
            attachment_id: "att_retry",
            content_type: "image/png",
            filename: "image.png",
            upload_status: "pending",
          },
          upload: {
            headers: { "Content-Type": "image/png" },
            method: "PUT",
            protocol: "s3_presigned_put",
            url: "https://objects.example.test/presigned",
          },
        },
        new File(["image"], "image.png", { type: "image/png" }),
      ),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects other non-2xx S3 upload responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 409,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadUserAttachmentFile(
        {
          attachment: {
            attachment_id: "att_conflict",
            content_type: "image/png",
            filename: "image.png",
            upload_status: "pending",
          },
          upload: {
            method: "PUT",
            protocol: "s3_presigned_put",
            url: "https://objects.example.test/presigned",
          },
        },
        new File(["image"], "image.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("Attachment upload failed with 409");
  });

  it("keeps the GCS resumable upload handshake compatible", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { Location: "https://storage.example.test/session" },
          status: 201,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["text"], "notes.txt", { type: "text/plain" });

    await uploadUserAttachmentFile(
      {
        attachment: {
          attachment_id: "att_2",
          content_type: "text/plain",
          filename: "notes.txt",
          upload_status: "pending",
        },
        upload: {
          headers: { "x-goog-resumable": "start" },
          method: "POST",
          protocol: "gcs_resumable",
          url: "https://storage.example.test/start",
        },
      },
      file,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://storage.example.test/start",
      expect.objectContaining({
        body: null,
        credentials: "omit",
        method: "POST",
        redirect: "error",
        referrerPolicy: "no-referrer",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://storage.example.test/session",
      expect.objectContaining({
        body: file,
        credentials: "omit",
        method: "PUT",
        redirect: "error",
        referrerPolicy: "no-referrer",
      }),
    );
  });

  it("redacts a GCS resumable session URL when the storage request fails", async () => {
    const sessionUrl =
      "https://storage.example.test/session?upload_id=top-secret";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          headers: { Location: sessionUrl },
          status: 201,
        }),
      )
      .mockRejectedValueOnce(new TypeError(`Failed to fetch ${sessionUrl}`));
    vi.stubGlobal("fetch", fetchMock);

    const upload = uploadUserAttachmentFile(
      {
        attachment: {
          attachment_id: "att_gcs_private",
          content_type: "text/plain",
          filename: "private.txt",
          upload_status: "pending",
        },
        upload: {
          method: "POST",
          protocol: "gcs_resumable",
          url: "https://storage.example.test/start?signature=start-secret",
        },
      },
      new File(["text"], "private.txt", { type: "text/plain" }),
    );

    await expect(upload).rejects.toThrow("Attachment upload request failed");
    await expect(upload).rejects.not.toThrow(sessionUrl);
    await expect(upload).rejects.not.toThrow("top-secret");
  });

  it("rejects an unknown attachment upload protocol before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadUserAttachmentFile(
        {
          attachment: {
            attachment_id: "att_3",
            filename: "unknown.bin",
            upload_status: "pending",
          },
          upload: {
            method: "PUT",
            protocol: "unknown_protocol",
            url: "https://objects.example.test/unknown",
          },
        },
        new File(["data"], "unknown.bin"),
      ),
    ).rejects.toThrow(
      'Unsupported attachment upload protocol "unknown_protocol".',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
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

describe("getLatestPaxdRelease", () => {
  it("resolves the latest stable paxd artifact for a node platform", async () => {
    apiFetch.mockResolvedValueOnce({
      platform: "darwin/arm64",
      size_bytes: 1234,
      tags: ["stable"],
      version: "1.2.3",
    });

    await expect(getLatestPaxdRelease("darwin", "arm64")).resolves.toEqual({
      platform: "darwin/arm64",
      size_bytes: 1234,
      tags: ["stable"],
      version: "1.2.3",
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/public/paxd/download?platform=darwin%2Farm64&tags=stable",
    );
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

  it("updates a session approval mode through pax_config", async () => {
    apiFetch.mockResolvedValueOnce({
      session_id: "sess_1",
      pax_config: { approval_mode: "auto_approve_all" },
    });

    await updateAgentSession("u1", "n1", "a1", "sess_1", {
      pax_config: { approval_mode: "auto_approve_all" },
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/nodes/n1/agents/a1/sessions/sess_1",
      {
        body: JSON.stringify({
          pax_config: { approval_mode: "auto_approve_all" },
        }),
        method: "PATCH",
      },
    );
  });

  it("updates and resets a custom session name", async () => {
    apiFetch.mockResolvedValue({ session_id: "sess_1" });

    await updateAgentSession("u1", "n1", "a1", "sess_1", {
      name: "Release planning",
    });
    await updateAgentSession("u1", "n1", "a1", "sess_1", {
      use_reported_name: true,
    });

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/u1/nodes/n1/agents/a1/sessions/sess_1",
      {
        body: JSON.stringify({ name: "Release planning" }),
        method: "PATCH",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/u1/nodes/n1/agents/a1/sessions/sess_1",
      {
        body: JSON.stringify({ use_reported_name: true }),
        method: "PATCH",
      },
    );
  });

  it("stops a session turn with a user-requested reason and idempotency key", async () => {
    apiFetch.mockResolvedValueOnce({
      command_id: "cmd_stop_1",
      effect: "cancelling",
      status: "accepted",
    });

    await stopSessionTurn("u1", "a1", "sess_1", {
      reason: "user_requested",
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/agents/a1/sessions/sess_1/turn/stop",
      {
        body: JSON.stringify({ reason: "user_requested" }),
        headers: {
          "Idempotency-Key": expect.any(String),
        },
        method: "POST",
      },
    );
  });

  it("requests a compare-and-reset for the displayed runtime turn", async () => {
    apiFetch.mockResolvedValueOnce({
      expected_turn_instance_id: "turn_1",
      status: "accepted_pending",
    });

    await resetSessionRuntime("u1", "a1", "sess_1", "turn_1");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/agents/a1/sessions/sess_1/runtime/reset",
      {
        body: JSON.stringify({ expected_turn_instance_id: "turn_1" }),
        method: "POST",
      },
    );
  });

  it("queues and steers a session turn with idempotency keys", async () => {
    apiFetch
      .mockResolvedValueOnce({
        command_id: "cmd_queue_1",
        effect: "queued",
        status: "accepted",
      })
      .mockResolvedValueOnce({
        command_id: "cmd_steer_1",
        effect: "steering",
        queue_effect: "replaced",
        status: "accepted",
        stop_effect: "cancelling",
      });

    await queueSessionTurn("u1", "a1", "sess_1", {
      input: "follow-up",
    });
    await steerSessionTurn("u1", "a1", "sess_1", {
      input: "change course",
    });

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/u1/agents/a1/sessions/sess_1/turn/queue",
      {
        body: JSON.stringify({ input: "follow-up" }),
        headers: {
          "Idempotency-Key": expect.any(String),
        },
        method: "POST",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/u1/agents/a1/sessions/sess_1/turn/steer",
      {
        body: JSON.stringify({ input: "change course" }),
        headers: {
          "Idempotency-Key": expect.any(String),
        },
        method: "POST",
      },
    );
  });

  it("reads, updates, and deletes the queued session turn", async () => {
    apiFetch
      .mockResolvedValueOnce({
        queued_turn_id: "turn_1",
        input: "queued draft",
      })
      .mockResolvedValueOnce({
        queued_turn_id: "turn_1",
        input: "queued updated",
      })
      .mockResolvedValueOnce({ effect: "deleted", status: "accepted" });

    await getQueuedSessionTurn("u1", "a1", "sess_1");
    await updateQueuedSessionTurn("u1", "a1", "sess_1", {
      input: "queued updated",
    });
    await deleteQueuedSessionTurn("u1", "a1", "sess_1");

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/u1/agents/a1/sessions/sess_1/turn/queue",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/u1/agents/a1/sessions/sess_1/turn/queue",
      {
        body: JSON.stringify({ input: "queued updated" }),
        headers: {
          "Idempotency-Key": expect.any(String),
        },
        method: "PATCH",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/user/u1/agents/a1/sessions/sess_1/turn/queue",
      {
        headers: {
          "Idempotency-Key": expect.any(String),
        },
        method: "DELETE",
      },
    );
  });
});

describe("getAgentPermissionCatalog", () => {
  it("reads the owner-scoped agent permission catalog", async () => {
    apiFetch.mockResolvedValueOnce({
      catalog_revision: 3,
      choices: [],
      source: "profile",
      stale: false,
    });

    await getAgentPermissionCatalog("u1", "a1");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/agents/a1/permission-catalog",
    );
  });
});

describe("node daemon control resources", () => {
  it("reads daemon state through node-scoped query endpoints", async () => {
    apiFetch.mockResolvedValue({ type: "test" });

    await getNodeDaemonStatus("u1", "n1");
    await listNodeDaemonHarnesses("u1", "n1");
    await discoverNodeDaemonHarnesses("u1", "n1", {
      names: ["codex"],
      probe: true,
    });
    await listNodeDaemonAgentConnections("u1", "n1");
    await getNodeDaemonCommand("u1", "n1", "cmd_1");

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/u1/nodes/n1/daemon/status",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/u1/nodes/n1/daemon/harnesses?include_missing=true",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/user/u1/nodes/n1/daemon/harnesses/discover",
      {
        body: JSON.stringify({ names: ["codex"], probe: true }),
        method: "POST",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/user/u1/nodes/n1/daemon/agent-connections?include_disabled=true",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      5,
      "/api/v1/user/u1/nodes/n1/daemon/commands/cmd_1",
    );
  });

  it("creates and mutates daemon connections with command ids", async () => {
    apiFetch.mockResolvedValue({
      command_id: "cmd_1",
      dispatch_status: "acknowledged",
    });

    await createNodeDaemonAgentConnection("u1", "n1", {
      agent_type: "codex",
      harness: "codex",
      name: "work",
      working_dir: "/workspace",
    });
    await updateNodeDaemonAgentConnection("u1", "n1", "conn_1", {
      desired_slots: 4,
      name: "work-2",
    });
    await startNodeDaemonAgentConnection("u1", "n1", "conn_1");
    await stopNodeDaemonAgentConnection("u1", "n1", "conn_1");
    await restartNodeDaemonAgentConnection("u1", "n1", "conn_1");
    await removeNodeDaemonAgentConnection("u1", "n1", "conn_1");

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/u1/nodes/n1/daemon/agent-connections",
      {
        body: expect.stringContaining('"desired_slots":2'),
        method: "POST",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/u1/nodes/n1/daemon/agent-connections/conn_1",
      {
        body: expect.stringContaining('"desired_slots":4'),
        method: "PATCH",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/user/u1/nodes/n1/daemon/agent-connections/conn_1",
      {
        body: expect.stringContaining('"desired_state":"running"'),
        method: "PATCH",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/user/u1/nodes/n1/daemon/agent-connections/conn_1/stop",
      { body: expect.stringContaining('"command_id"'), method: "POST" },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      5,
      "/api/v1/user/u1/nodes/n1/daemon/agent-connections/conn_1/restart",
      { body: expect.stringContaining('"command_id"'), method: "POST" },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      6,
      "/api/v1/user/u1/nodes/n1/daemon/agent-connections/conn_1",
      { body: expect.stringContaining('"command_id"'), method: "DELETE" },
    );
  });

  it("requests immediate paxd restart and upgrade with command ids", async () => {
    apiFetch.mockResolvedValue({
      command_id: "cmd_1",
      dispatch_status: "acknowledged",
    });

    await restartNodeDaemon("u1", "n1");
    await upgradeNodeDaemon("u1", "n1", { version: "1.2.3" });

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/u1/nodes/n1/daemon/restart",
      {
        body: expect.stringMatching(/"command_id":"[^"]+","mode":"immediate"/),
        method: "POST",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/u1/nodes/n1/daemon/upgrade",
      {
        body: expect.stringMatching(
          /"command_id":"[^"]+","version":"1\.2\.3","tag":"stable","mode":"immediate"/,
        ),
        method: "POST",
      },
    );
  });
});

describe("listUserSessions", () => {
  it("requests paginated user sessions with comma-separated filters", async () => {
    apiFetch.mockResolvedValueOnce({
      pagination: { page_num: 2, page_size: 20, total: 21, total_pages: 2 },
      sessions: [{ session_id: "sess_1" }],
    });

    await expect(
      listUserSessions("u1", {
        agentIds: ["a2", "a1", "a1"],
        nodeIds: ["n2", "n1"],
        pageNum: 2,
        pageSize: 20,
        primaryProjectId: " proj_1 ",
        includeArchived: true,
      }),
    ).resolves.toEqual({
      pagination: { page_num: 2, page_size: 20, total: 21, total_pages: 2 },
      sessions: [{ session_id: "sess_1" }],
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/sessions?node_id=n1%2Cn2&agent_id=a1%2Ca2&page_size=20&page_num=2&primary_project_id=proj_1&include_archived=true",
    );
  });

  it("resolves session metadata across pages by session ID", async () => {
    apiFetch
      .mockResolvedValueOnce({
        pagination: { page_num: 1, page_size: 200, total_pages: 2 },
        sessions: [{ session_id: "sess_other" }],
      })
      .mockResolvedValueOnce({
        pagination: { page_num: 2, page_size: 200, total_pages: 2 },
        sessions: [
          { agent_id: "agent_1", node_id: "node_1", session_id: "sess_1" },
        ],
      });

    await expect(getUserSession("u1", "sess_1")).resolves.toMatchObject({
      agent_id: "agent_1",
      node_id: "node_1",
      session_id: "sess_1",
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/u1/sessions?page_size=200&page_num=1&include_archived=true",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/u1/sessions?page_size=200&page_num=2&include_archived=true",
    );
  });
});

describe("project resources", () => {
  it("uses the Project CRUD routes and payloads", async () => {
    apiFetch.mockResolvedValue({});

    await listProjects("usr_1");
    await listProjects("usr_1", true);
    await getProject("usr_1", "proj_1");
    await createProject("usr_1", {
      display_name: "Manager",
      parent_project_id: "proj_root",
    });
    await updateProject("usr_1", "proj_1", {
      display_name: "Pax Manager",
      parent_project_id: "",
    });
    await archiveProject("usr_1", "proj_1");

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/v1/user/usr_1/projects");
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/projects?include_archived=true",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/user/usr_1/projects/proj_1",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(4, "/api/v1/user/usr_1/projects", {
      body: JSON.stringify({
        display_name: "Manager",
        parent_project_id: "proj_root",
      }),
      method: "POST",
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      5,
      "/api/v1/user/usr_1/projects/proj_1",
      {
        body: JSON.stringify({
          display_name: "Pax Manager",
          parent_project_id: "",
        }),
        method: "PATCH",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      6,
      "/api/v1/user/usr_1/projects/proj_1/archive",
      { method: "POST" },
    );
  });

  it("uses nested Target CRUD routes", async () => {
    apiFetch.mockResolvedValue({});

    await listProjectTargets("usr_1", "proj_1");
    await getProjectTarget("usr_1", "proj_1", "ptgt_1");
    await createProjectTarget("usr_1", "proj_1", {
      agent_id: "agent_1",
      cwd: "~/repo",
      is_default: true,
    });
    await updateProjectTarget("usr_1", "proj_1", "ptgt_1", {
      enabled: false,
    });
    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/usr_1/projects/proj_1/targets",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/projects/proj_1/targets/ptgt_1",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/user/usr_1/projects/proj_1/targets",
      {
        body: JSON.stringify({
          agent_id: "agent_1",
          cwd: "~/repo",
          is_default: true,
        }),
        method: "POST",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/user/usr_1/projects/proj_1/targets/ptgt_1",
      {
        body: JSON.stringify({ enabled: false }),
        method: "PATCH",
      },
    );
  });
});

describe("listSessionHistory", () => {
  it("requests history by session ID without an agent ID", async () => {
    apiFetch.mockResolvedValueOnce({ messages: [] });

    await expect(listSessionHistory("u1", "sess_1")).resolves.toEqual({
      messages: [],
    });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/sessions/sess_1/history?limit=500",
    );
  });

  it("requests the next history page with the seq cursor", async () => {
    apiFetch.mockResolvedValueOnce({
      messages: [],
      pagination: { has_older: false },
    });

    await listSessionHistory("u1", "sess_1", 500, { beforeSeq: 42 });

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/sessions/sess_1/history?limit=500&before_seq=42",
    );
  });

  it("supports forward catch-up and legacy before_id cursors", async () => {
    apiFetch.mockResolvedValue({ messages: [], pagination: {} });

    await listSessionHistory("u1", "sess_1", 500, { afterSeq: 7 });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/sessions/sess_1/history?limit=500&after_seq=7",
    );

    await listSessionHistory("u1", "sess_1", 500, { beforeId: 99 });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/u1/sessions/sess_1/history?limit=500&before_id=99",
    );
  });

  it("prepends older history pages while preserving chronological order", () => {
    expect(
      flattenSessionHistoryPages([
        {
          messages: [{ message_id: "msg_3" }, { message_id: "msg_4" }],
          pagination: { has_more: true, next_before_id: 3 },
        },
        {
          messages: [{ message_id: "msg_1" }, { message_id: "msg_2" }],
          pagination: { has_more: false },
        },
      ]).map((message) => message.message_id),
    ).toEqual(["msg_1", "msg_2", "msg_3", "msg_4"]);
  });

  it("treats a null empty-history response as no messages", () => {
    expect(
      flattenSessionHistoryPages([
        {
          messages: null,
          pagination: { has_more: false },
        },
      ]),
    ).toEqual([]);
  });
});

describe("listAgentOwnerInfos", () => {
  it("fetches owner info by agent id and returns a map keyed by agent id", async () => {
    apiFetch.mockResolvedValueOnce({
      owner_info: {
        agent: { agent_id: "agent_a", name: "Contract Writer" },
        owner: {
          kind: "user",
          user: {
            display_name: "Ada",
            email: "ada@example.com",
            user_id: "usr_ada",
          },
        },
      },
    });
    apiFetch.mockResolvedValueOnce({
      owner_info: {
        agent: { agent_id: "agent_b", name: "Review Agent" },
        owner: {
          kind: "team",
          team: {
            agent_count: 1,
            member_count: 2,
            name: "Contracts",
            owner_user_id: "usr_owner",
            status: "active",
            team_id: "team_contracts",
          },
        },
      },
    });

    const infos = await listAgentOwnerInfos("usr_1", [
      { representativeAgentId: "rep_b", agentId: "agent_b" },
      { agentId: "agent_a" },
      { agentId: "agent_a" },
    ]);

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/usr_1/agent-owner-info?agent_id=agent_a",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/agent-owner-info?representative_agent_id=rep_b",
    );
    expect(infos).toMatchObject({
      "agent:agent_a": {
        agent: { name: "Contract Writer" },
        owner: { user: { display_name: "Ada" } },
      },
      "agent:agent_b": {
        agent: { name: "Review Agent" },
        owner: { team: { name: "Contracts" } },
      },
      "rep:rep_b": {
        agent: { name: "Review Agent" },
        owner: { team: { name: "Contracts" } },
      },
    });
  });
});

describe("collaboration resources", () => {
  it("uses v1 fleet cleanup paths for nodes and agents", async () => {
    apiFetch.mockResolvedValueOnce({ node_id: "node_1" });
    apiFetch.mockResolvedValueOnce({ agent_id: "agent_1" });
    apiFetch.mockResolvedValueOnce({ agent_id: "agent_2" });

    await deleteNode("usr_1", "node_1");
    await deleteAgent("usr_1", "agent_1");
    await deleteNodeAgent("usr_1", "node_1", "agent_2");

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/usr_1/nodes/node_1",
      { method: "DELETE" },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/agents/agent_1",
      { method: "DELETE" },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/user/usr_1/nodes/node_1/agents/agent_2",
      { method: "DELETE" },
    );
  });

  it("uses flat v1 agent list and detail paths", async () => {
    apiFetch.mockResolvedValueOnce({ agents: [] });
    apiFetch.mockResolvedValueOnce({ agent_id: "agent_1" });

    await listAgents("usr_1");
    await getAgent("usr_1", "agent_1");

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/api/v1/user/usr_1/agents");
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/agents/agent_1",
    );
  });

  it("requests only owned agents when scope is owned", async () => {
    apiFetch.mockResolvedValueOnce({ agents: [] });

    await listAgents("usr_1", "owned");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/usr_1/agents?scope=owned",
    );
  });

  it("updates node and agent user-maintained profile fields", async () => {
    apiFetch.mockResolvedValueOnce({ node_id: "node_1" });
    apiFetch.mockResolvedValueOnce({ agent_id: "agent_1" });

    await updateNodeProfile("usr_1", "node_1", {
      description: "Main workstation",
      name: "desk mac",
      user_metadata: { labels: ["primary"] },
    });
    await updateNodeAgentProfile("usr_1", "node_1", "agent_1", {
      card: { routing_tags: ["review"], skills: ["tests"] },
      description: "Reviews risky changes",
      name: "reviewer",
      user_metadata: { priority: "high" },
    });

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/usr_1/nodes/node_1",
      {
        body: JSON.stringify({
          description: "Main workstation",
          name: "desk mac",
          user_metadata: { labels: ["primary"] },
        }),
        method: "PATCH",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/nodes/node_1/agents/agent_1",
      {
        body: JSON.stringify({
          card: { routing_tags: ["review"], skills: ["tests"] },
          description: "Reviews risky changes",
          name: "reviewer",
          user_metadata: { priority: "high" },
        }),
        method: "PATCH",
      },
    );
  });

  it("lists teams through the user-scoped PAX API path", async () => {
    apiFetch.mockResolvedValueOnce({ teams: [] });

    await listTeams("usr_1");

    expect(apiFetch).toHaveBeenCalledWith("/api/v1/user/usr_1/teams");
  });

  it("creates team invites with an explicit member default role", async () => {
    apiFetch.mockResolvedValueOnce({ invite: { invite_id: "tinv_1" } });

    await createTeamInvite("usr_1", "team_1", "person@example.com");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/usr_1/teams/team_1/invites",
      {
        body: JSON.stringify({ email: "person@example.com", role: "member" }),
        method: "POST",
      },
    );
  });

  it("calls team management endpoints added for archive, roles, cancel, and audit", async () => {
    apiFetch.mockResolvedValueOnce({ team: { team_id: "team_1" } });
    apiFetch.mockResolvedValueOnce({ member: { user_id: "usr_2" } });
    apiFetch.mockResolvedValueOnce({ invite: { invite_id: "tinv_1" } });
    apiFetch.mockResolvedValueOnce({ events: [] });

    await archiveTeam("usr_1", "team_1");
    await updateTeamMemberRole("usr_1", "team_1", "usr_2", "operator");
    await cancelTeamInvite("usr_1", "team_1", "tinv_1");
    await listTeamAuditEvents("usr_1", "team_1", 25);

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/api/v1/user/usr_1/teams/team_1/archive",
      { method: "POST" },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      2,
      "/api/v1/user/usr_1/teams/team_1/members/usr_2/role",
      {
        body: JSON.stringify({ role: "operator" }),
        method: "POST",
      },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/api/v1/user/usr_1/teams/team_1/invites/tinv_1/cancel",
      { method: "POST" },
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      "/api/v1/user/usr_1/teams/team_1/audit?limit=25",
    );
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
    const payload = {
      schema_version: "paxl.envelope_payload.knowledge_capsule.v2",
    };

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
