/* @vitest-environment jsdom */

import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/features/api/query-keys";
import type { User } from "@/features/api/types";
import { useConsoleStore } from "@/stores/console-store";
import { featuresQueryKey, useFeature, useFeatures } from "./use-feature";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const admin: User = { user_id: "admin_1", is_admin: true };
const member: User = { user_id: "member_1", role: "member" };

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mount(user: User | null = admin) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  if (user) client.setQueryData(queryKeys.me(), user);
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
  useConsoleStore.setState({ previewAsUser: false });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  fetchMock.mockReset();
  useConsoleStore.setState({ previewAsUser: false });
  focusManager.setFocused(undefined);
  vi.unstubAllGlobals();
});

describe("Given runtime feature visibility", () => {
  it("keeps every feature disabled while the first snapshot is loading", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { wrapper } = mount();
    const { result } = renderHook(() => useFeatures(), { wrapper });
    expect(result.current.ready).toBe(false);
    expect(result.current.enabled("collaboration")).toBe(false);
    expect(result.current.enabled("knowledge_capsules")).toBe(false);
  });

  it.each([503, 401])(
    "fails closed without cached features after HTTP %i",
    async (status) => {
      fetchMock.mockImplementation(async () => response(null, status));
      const { wrapper } = mount();
      const { result } = renderHook(() => useFeatures(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.enabled("collaboration")).toBe(false);
      expect(result.current.enabled("voice_input")).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2); // account refresh and feature read
    },
  );

  it("fails closed after a network failure without a cached snapshot", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { wrapper } = mount();
    const { result } = renderHook(() => useFeatures(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.enabled("knowledge_capsules")).toBe(false);
  });

  it("uses only explicitly enabled flags and leaves missing or malformed values disabled", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/me")
        ? response({ user: member })
        : response({
            revision: 42,
            features: {
              collaboration: true,
              knowledge_capsules: false,
              voice_input: "true",
            },
          }),
    );
    const { wrapper } = mount(member);
    const { result } = renderHook(() => useFeatures(), { wrapper });
    await waitFor(() =>
      expect(result.current.enabled("collaboration")).toBe(true),
    );
    expect(result.current.ready).toBe(true);
    expect(result.current.enabled("knowledge_capsules")).toBe(false);
    expect(result.current.enabled("secretary")).toBe(false);
    expect(result.current.enabled("voice_input")).toBe(false);
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === "/api/pax/api/v1/user/self/features",
      ),
    ).toBe(true);
  });

  it("preserves a cached grant while refreshing and after the refresh fails", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/me")
        ? response({ user: admin })
        : response(null, 503),
    );
    const { client, wrapper } = mount();
    client.setQueryData(featuresQueryKey(admin.user_id, false), {
      revision: 41,
      features: { collaboration: true },
    });
    const { result } = renderHook(() => useFeature("collaboration"), {
      wrapper,
    });
    expect(result.current).toBe(true);
    await act(() => client.invalidateQueries({ queryKey: ["features"] }));
    expect(
      client.getQueryState(featuresQueryKey(admin.user_id, false))?.status,
    ).toBe("error");
    expect(result.current).toBe(true);
  });

  it("isolates normal and preview snapshots and asks Manager to resolve the preview", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).endsWith("/me")) return response({ user: admin });
      if (String(url).endsWith("?as=user"))
        return response({ revision: 42, features: { collaboration: false } });
      return response({ revision: 42, features: { collaboration: true } });
    });
    const { client, wrapper } = mount();
    const { result } = renderHook(() => useFeature("collaboration"), {
      wrapper,
    });
    await waitFor(() => expect(result.current).toBe(true));
    act(() => useConsoleStore.getState().setPreviewAsUser(true));
    expect(result.current).toBe(false);
    await waitFor(() =>
      expect(
        client.getQueryState(featuresQueryKey(admin.user_id, true))?.status,
      ).toBe("success"),
    );
    expect(
      fetchMock.mock.calls.some(
        ([url]) => url === "/api/pax/api/v1/user/self/features?as=user",
      ),
    ).toBe(true);
    expect(result.current).toBe(false);
    act(() => useConsoleStore.getState().setPreviewAsUser(false));
    expect(result.current).toBe(true);
  });

  it.each([
    [admin, false, true],
    [admin, true, false],
    [member, false, false],
    [{ user_id: "owner_1", role: "owner" }, false, true],
  ])(
    "falls back to the existing admin visibility for an old Manager (user=%j, preview=%s)",
    async (user, preview, enabled) => {
      useConsoleStore.setState({ previewAsUser: preview });
      fetchMock.mockImplementation(async (url) =>
        String(url).endsWith("/me") ? response({ user }) : response(null, 404),
      );
      const { wrapper } = mount(user);
      const { result } = renderHook(() => useFeatures(), { wrapper });
      await waitFor(() => expect(result.current.ready).toBe(true));
      expect(result.current.enabled("collaboration")).toBe(enabled);
      expect(result.current.enabled("knowledge_capsules")).toBe(enabled);
    },
  );

  it("never fetches feature data before the current account is available", () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { wrapper } = mount(null);
    const { result } = renderHook(() => useFeature("collaboration"), {
      wrapper,
    });
    expect(result.current).toBe(false);
    expect(
      fetchMock.mock.calls.every(([url]) => String(url).endsWith("/me")),
    ).toBe(true);
  });

  it("does not reuse the previous account's grant", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { client, wrapper } = mount();
    client.setQueryData(featuresQueryKey(admin.user_id, false), {
      revision: 42,
      features: { collaboration: true },
    });
    const { result } = renderHook(() => useFeature("collaboration"), {
      wrapper,
    });
    expect(result.current).toBe(true);
    act(() => client.setQueryData(queryKeys.me(), member));
    await waitFor(() => expect(result.current).toBe(false));
    expect(featuresQueryKey(member.user_id, false)).toEqual([
      "features",
      "member_1",
      false,
    ]);
  });

  it("keeps snapshots fresh for 60 seconds and rechecks stale features on focus", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/me")
        ? response({ user: admin })
        : response({ revision: 42, features: { collaboration: true } }),
    );
    const { client, wrapper } = mount();
    const { result } = renderHook(() => useFeature("collaboration"), {
      wrapper,
    });
    await waitFor(() => expect(result.current).toBe(true));
    const query = client
      .getQueryCache()
      .find({ queryKey: featuresQueryKey(admin.user_id, false) });
    expect(query?.options).toMatchObject({
      staleTime: 60_000,
      refetchOnWindowFocus: true,
    });
    const featureReads = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).includes("/features"))
        .length;
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    expect(featureReads()).toBe(1);
    client.setQueryData(
      featuresQueryKey(admin.user_id, false),
      { revision: 42, features: { collaboration: true } },
      { updatedAt: Date.now() - 61_000 },
    );
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(featureReads()).toBe(2));
  });
});
