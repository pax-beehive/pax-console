/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { secretaryRetryRequests } from "./secretary-retry-requests";
import {
  getSecretarySettings,
  runSecretaryNow,
  secretaryKeys,
  SecretarySettings,
  updateSecretarySettings,
  UpdateSecretarySettings,
  useSecretarySettings,
  useUpdateSecretarySettings,
  useRunSecretaryNow,
} from "./secretary";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const saved: SecretarySettings = {
  enabled: false,
  revision: 0,
  state: "disabled",
  pending_count: 0,
  agent_available: false,
};
const enabled: SecretarySettings = {
  ...saved,
  agent_id: "agent_1",
  enabled: true,
  revision: 1,
  state: "idle",
  agent_available: true,
};
function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify({
      code: status,
      message: status >= 400 ? "conflict" : "ok",
      data,
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0, gcTime: Infinity } },
  });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  secretaryRetryRequests.setState({ pending: {} });
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Secretary HTTP contract", () => {
  it("reads authenticated settings through the same-origin proxy without an owner selector", async () => {
    fetchMock.mockResolvedValue(response(saved));
    const signal = new AbortController().signal;
    await expect(getSecretarySettings("self", signal)).resolves.toEqual(saved);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pax/api/v1/user/self/secretary");
    expect(init).toMatchObject({ credentials: "include" });
    expect(init?.signal?.aborted).toBe(false);
    expect(signal.aborted).toBe(false);
    expect(new Headers(init?.headers).has("Content-Type")).toBe(false);
    expect(init?.body).toBeUndefined();
  });
  it("PATCHes only selected agent, explicit enablement and expected revision", async () => {
    fetchMock.mockResolvedValue(response(enabled));
    const input = {
      agent_id: "agent_1",
      enabled: true,
      expected_revision: 0,
      owner_user_id: "intruder",
      revision: 99,
    } as UpdateSecretarySettings;
    await expect(updateSecretarySettings("self", input)).resolves.toEqual(
      enabled,
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pax/api/v1/user/self/secretary",
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      agent_id: "agent_1",
      enabled: true,
      expected_revision: 0,
    });
  });
  it("allows clearing an agent while explicitly disabling", async () => {
    fetchMock.mockResolvedValue(response(saved));
    await updateSecretarySettings("self", {
      agent_id: "",
      enabled: false,
      expected_revision: 8,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      agent_id: "",
      enabled: false,
      expected_revision: 8,
    });
  });
  it("requests a run without creating an agent or sending source content", async () => {
    fetchMock.mockResolvedValue(response({ ...enabled, pending_count: 3 }));
    await runSecretaryNow("self", "retry-request");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pax/api/v1/user/self/secretary/run");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      request_id: "retry-request",
    });
  });
  it("recognizes an immutable retry acceptance receipt without decoding it as settings", async () => {
    const receipt = {
      request_id: "retry-receipt",
      state: "accepted",
      accepted_at: "2026-11-11T12:00:00Z",
    };
    fetchMock.mockResolvedValue(response(receipt, 202));
    await expect(runSecretaryNow("self", receipt.request_id)).resolves.toEqual(
      receipt,
    );
  });
  it.each([
    {},
    {
      request_id: "different",
      state: "accepted",
      accepted_at: "2026-11-11T12:00:00Z",
    },
    { request_id: "expected", state: "accepted", accepted_at: "invalid" },
    { enabled: true, state: "idle" },
  ])(
    "does not acknowledge a malformed or mismatched retry response",
    async (data) => {
      fetchMock.mockResolvedValue(response(data, 202));
      await expect(runSecretaryNow("self", "expected")).rejects.toThrow(
        "Unexpected Secretary retry response",
      );
    },
  );
});

describe("Secretary query state", () => {
  it("does not request settings before a user is available", () => {
    const context = wrapper();
    renderHook(() => useSecretarySettings(undefined), context);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("separates caches by signed-in user and never implicitly enables", async () => {
    fetchMock.mockImplementation(async () => response(saved));
    const context = wrapper();
    const hook = renderHook(({ userId }) => useSecretarySettings(userId), {
      ...context,
      initialProps: { userId: "owner_a" },
    });
    await waitFor(() => expect(hook.result.current.data).toEqual(saved));
    hook.rerender({ userId: "owner_b" });
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(hook.result.current.data?.enabled).toBe(false));
    expect(
      fetchMock.mock.calls.every(
        ([, init]) => !init?.method || init.method === "GET",
      ),
    ).toBe(true);
    expect(
      context.client.getQueryData(secretaryKeys.settings("owner_a")),
    ).toEqual(saved);
  });
  it("does not optimistically mark settings enabled before PATCH succeeds", async () => {
    let resolveRequest!: (value: Response) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const context = wrapper();
    context.client.setQueryData(secretaryKeys.settings("self"), saved);
    const hook = renderHook(() => useUpdateSecretarySettings("self"), context);
    act(() =>
      hook.result.current.mutate({
        agent_id: "agent_1",
        enabled: true,
        expected_revision: 0,
      }),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(context.client.getQueryData(secretaryKeys.settings("self"))).toEqual(
      saved,
    );
    resolveRequest(response(enabled));
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(context.client.getQueryData(secretaryKeys.settings("self"))).toEqual(
      enabled,
    );
  });
  it("preserves persisted state on save failure and does not retry writes", async () => {
    fetchMock.mockResolvedValue(response({}, 503));
    const context = wrapper();
    context.client.setQueryData(secretaryKeys.settings("self"), saved);
    const hook = renderHook(() => useUpdateSecretarySettings("self"), context);
    act(() =>
      hook.result.current.mutate({
        agent_id: "agent_1",
        enabled: true,
        expected_revision: 0,
      }),
    );
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(context.client.getQueryData(secretaryKeys.settings("self"))).toEqual(
      saved,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("refetches current settings after a revision conflict", async () => {
    let current = saved;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "PATCH") {
        current = { ...enabled, revision: 7 };
        return response({}, 409);
      }
      return response(current);
    });
    const context = wrapper();
    const hook = renderHook(
      () => ({
        query: useSecretarySettings("self"),
        mutation: useUpdateSecretarySettings("self"),
      }),
      context,
    );
    await waitFor(() => expect(hook.result.current.query.data).toEqual(saved));
    act(() =>
      hook.result.current.mutation.mutate({
        agent_id: "agent_1",
        enabled: true,
        expected_revision: 0,
      }),
    );
    await waitFor(() =>
      expect(hook.result.current.query.data?.revision).toBe(7),
    );
    expect(hook.result.current.mutation.error).toBeInstanceOf(ApiError);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(1);
  });
  it("reconciles persisted state if a save commits but its response fails", async () => {
    let current = saved;
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "PATCH") {
        current = enabled;
        return response({}, 503);
      }
      return response(current);
    });
    const context = wrapper();
    const hook = renderHook(
      () => ({
        query: useSecretarySettings("self"),
        mutation: useUpdateSecretarySettings("self"),
      }),
      context,
    );
    await waitFor(() => expect(hook.result.current.query.data).toEqual(saved));
    act(() =>
      hook.result.current.mutation.mutate({
        agent_id: "agent_1",
        enabled: true,
        expected_revision: 0,
      }),
    );
    await waitFor(() =>
      expect(hook.result.current.mutation.isError).toBe(true),
    );
    await waitFor(() =>
      expect(hook.result.current.query.data).toEqual(enabled),
    );
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH"),
    ).toHaveLength(1);
  });
  it("acknowledges a legacy settings response without retrying it or claiming completed work", async () => {
    const queued = {
      ...enabled,
      pending_count: 2,
      state: "processing" as const,
    };
    fetchMock.mockResolvedValue(response(queued));
    const context = wrapper();
    context.client.setQueryData(
      secretaryKeys.settings("legacy-owner"),
      enabled,
    );
    const hook = renderHook(() => useRunSecretaryNow("legacy-owner"), context);
    act(() => hook.result.current.mutate());
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(
      context.client.getQueryData(secretaryKeys.settings("legacy-owner")),
    ).toEqual(queued);
    expect(queued.last_completed_at).toBeUndefined();
    expect(hook.result.current.hasUnconfirmedRequest).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("keeps receipt acceptance successful when the independent settings refresh fails", async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        const { request_id } = JSON.parse(String(init.body));
        return response(
          {
            request_id,
            state: "accepted",
            accepted_at: "2026-11-11T12:00:00Z",
          },
          202,
        );
      }
      return response({}, 503);
    });
    const context = wrapper();
    context.client.setQueryData(
      secretaryKeys.settings("receipt-owner"),
      enabled,
    );
    const hook = renderHook(
      () => ({
        settings: useSecretarySettings("receipt-owner"),
        run: useRunSecretaryNow("receipt-owner"),
      }),
      context,
    );
    act(() => hook.result.current.run.mutate());
    await waitFor(() => expect(hook.result.current.run.isSuccess).toBe(true));
    await waitFor(() =>
      expect(hook.result.current.settings.isError).toBe(true),
    );
    expect(hook.result.current.run.isSuccess).toBe(true);
    expect(hook.result.current.run.data).toMatchObject({ state: "accepted" });
    expect(
      context.client.getQueryData(secretaryKeys.settings("receipt-owner")),
    ).toEqual(enabled);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "POST"),
    ).toHaveLength(1);
  });
  it.each(["pending", "rejected"])(
    "keeps receipt acceptance independent of %s settings and task refresh",
    async (refresh) => {
      const context = wrapper();
      const invalidation = vi
        .spyOn(context.client, "invalidateQueries")
        .mockImplementation(() =>
          refresh === "rejected"
            ? Promise.reject(new Error("refresh failed"))
            : new Promise(() => {}),
        );
      fetchMock.mockImplementation(async (_url, init) => {
        const { request_id } = JSON.parse(String(init?.body));
        return response(
          {
            request_id,
            state: "accepted",
            accepted_at: "2026-11-11T12:00:00Z",
          },
          202,
        );
      });
      const hook = renderHook(
        () => useRunSecretaryNow("slow-refresh"),
        context,
      );
      act(() => hook.result.current.mutate());
      await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
      expect(invalidation).toHaveBeenCalledWith({
        queryKey: secretaryKeys.settings("slow-refresh"),
        exact: true,
      });
      expect(invalidation).toHaveBeenCalledWith({
        queryKey: ["secretary-tasks", "slow-refresh"],
      });
      expect(
        context.client.getQueryData(secretaryKeys.settings("slow-refresh")),
      ).toBeUndefined();
      invalidation.mockRestore();
    },
  );
  it("retains the same request after a lost response and creates a new key only after acknowledgement", async () => {
    let lost = true;
    fetchMock.mockImplementation(async (_url, init) => {
      if (lost) throw new DOMException("Timed out", "TimeoutError");
      const { request_id } = JSON.parse(String(init?.body));
      return response(
        { request_id, state: "accepted", accepted_at: "2026-11-11T12:00:00Z" },
        202,
      );
    });
    const context = wrapper();
    const hook = renderHook(() => useRunSecretaryNow("lost-response"), context);
    act(() => hook.result.current.mutate());
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    const first = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    ).request_id;
    expect(hook.result.current.hasUnconfirmedRequest).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    lost = false;
    act(() => hook.result.current.mutate());
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(
      JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).request_id,
    ).toBe(first);
    expect(hook.result.current.hasUnconfirmedRequest).toBe(false);
    act(() => hook.result.current.mutate());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(
      JSON.parse(String(fetchMock.mock.calls[2][1]?.body)).request_id,
    ).not.toBe(first);
  });
  it("isolates a switched owner from a previous owner's late acceptance", async () => {
    let finishOld!: (response: Response) => void;
    let finishCurrent!: (response: Response) => void;
    let requests = 0;
    fetchMock.mockImplementation(() => {
      if (++requests === 1)
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      return new Promise((resolve) => {
        finishCurrent = resolve;
      });
    });
    const context = wrapper();
    const hook = renderHook(({ owner }) => useRunSecretaryNow(owner), {
      ...context,
      initialProps: { owner: "owner-a" },
    });
    act(() => hook.result.current.mutate());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const first = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    ).request_id;
    hook.rerender({ owner: "owner-b" });
    expect(hook.result.current.isSuccess).toBe(false);
    expect(hook.result.current.hasUnconfirmedRequest).toBe(false);
    act(() => hook.result.current.mutate());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const second = JSON.parse(
      String(fetchMock.mock.calls[1][1]?.body),
    ).request_id;
    expect(second).not.toBe(first);
    expect(
      fetchMock.mock.calls.every(
        ([url]) => url === "/api/pax/api/v1/user/self/secretary/run",
      ),
    ).toBe(true);
    await act(async () => {
      finishOld(
        response(
          {
            request_id: first,
            state: "accepted",
            accepted_at: "2026-11-11T12:00:00Z",
          },
          202,
        ),
      );
    });
    expect(hook.result.current.isPending).toBe(true);
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.hasUnconfirmedRequest).toBe(true);
    expect(
      secretaryRetryRequests.getState().pending["owner-a"],
    ).toBeUndefined();
    expect(secretaryRetryRequests.getState().pending["owner-b"]).toBe(second);
    await act(async () => {
      finishCurrent(
        response(
          {
            request_id: second,
            state: "accepted",
            accepted_at: "2026-11-11T12:00:00Z",
          },
          202,
        ),
      );
    });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.data).toMatchObject({ request_id: second });
  });
  it("does not retry unavailable or missing Secretary settings endlessly", async () => {
    fetchMock.mockResolvedValue(response({}, 404));
    const context = wrapper();
    const hook = renderHook(() => useSecretarySettings("self"), context);
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
