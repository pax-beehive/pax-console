/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
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
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
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
    expect(init).toMatchObject({ credentials: "include", signal });
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
    await runSecretaryNow("self");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/pax/api/v1/user/self/secretary/run");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeUndefined();
  });
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
  it("uses the returned run status without treating the request as completed work", async () => {
    const queued = {
      ...enabled,
      pending_count: 2,
      state: "processing" as const,
    };
    fetchMock.mockResolvedValue(response(queued));
    const context = wrapper();
    context.client.setQueryData(secretaryKeys.settings("self"), enabled);
    const hook = renderHook(() => useRunSecretaryNow("self"), context);
    act(() => hook.result.current.mutate());
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(context.client.getQueryData(secretaryKeys.settings("self"))).toEqual(
      queued,
    );
    expect(queued.last_completed_at).toBeUndefined();
  });
  it("does not retry unavailable or missing Secretary settings endlessly", async () => {
    fetchMock.mockResolvedValue(response({}, 404));
    const context = wrapper();
    const hook = renderHook(() => useSecretarySettings("self"), context);
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
