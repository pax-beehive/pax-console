// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getConfig, getConfigAudit } from "./api";
import {
  configKeys,
  useConfigAudit,
  useRuntimeConfig,
} from "./use-runtime-config";
import type { ConfigSnapshot } from "./types";

vi.mock("./api", () => ({
  getConfig: vi.fn(),
  getConfigAudit: vi.fn(),
}));

const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  clients.push(client);
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

const snapshot = (region: "us" | "hk", revision = 1): ConfigSnapshot => ({
  region,
  revision,
  vault_configured: true,
  health: {
    last_refresh_at: "2026-11-13T12:00:00Z",
    refresh_failures: 0,
    degraded: false,
  },
  entries: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

describe("regional runtime config queries", () => {
  it("Given a region change, uses a distinct regional snapshot without showing old data", async () => {
    vi.mocked(getConfig).mockImplementation(async (region) => snapshot(region));
    const { Wrapper, client } = wrapper();
    const { result, rerender } = renderHook(
      ({ region }) => useRuntimeConfig("admin-1", region),
      { initialProps: { region: "us" as "us" | "hk" }, wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.data?.region).toBe("us"));
    rerender({ region: "hk" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.region).toBe("hk"));
    expect(client.getQueryData(configKeys.snapshot("admin-1", "us"))).toEqual(
      snapshot("us"),
    );
    expect(client.getQueryData(configKeys.snapshot("admin-1", "hk"))).toEqual(
      snapshot("hk"),
    );
  });

  it("Given an account change, never reuses the previous administrator cache", async () => {
    vi.mocked(getConfig).mockResolvedValue(snapshot("us"));
    const { Wrapper, client } = wrapper();
    client.setQueryData(
      configKeys.snapshot("admin-1", "us"),
      snapshot("us", 9),
    );
    const { result, rerender } = renderHook(
      ({ userId }) => useRuntimeConfig(userId, "us"),
      { initialProps: { userId: "admin-1" }, wrapper: Wrapper },
    );
    expect(result.current.data?.revision).toBe(9);
    rerender({ userId: "admin-2" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data?.revision).toBe(1));
  });

  it("Given no authenticated identity, does not request protected data", () => {
    const { Wrapper } = wrapper();
    renderHook(() => useRuntimeConfig("", "us"), { wrapper: Wrapper });
    expect(getConfig).not.toHaveBeenCalled();
  });

  it("Given a transient refresh failure, retains the last regional snapshot", async () => {
    vi.mocked(getConfig).mockRejectedValue(new Error("offline"));
    const { Wrapper, client } = wrapper();
    client.setQueryData(
      configKeys.snapshot("admin-1", "hk"),
      snapshot("hk", 3),
    );
    const { result } = renderHook(() => useRuntimeConfig("admin-1", "hk"), {
      wrapper: Wrapper,
    });
    expect(result.current.isError).toBe(false);
    await act(async () => {
      await result.current.refetch();
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data?.revision).toBe(3);
    expect(getConfig).toHaveBeenCalledTimes(1);
  });
});

describe("regional runtime config audit", () => {
  it("Given an inactive audit tab, fetches only after activation", async () => {
    vi.mocked(getConfigAudit).mockResolvedValue({
      items: [],
      next_cursor: null,
    });
    const { Wrapper } = wrapper();
    const { result, rerender } = renderHook(
      ({ enabled }) => useConfigAudit("admin-1", "hk", undefined, enabled),
      { initialProps: { enabled: false }, wrapper: Wrapper },
    );
    expect(getConfigAudit).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getConfigAudit).toHaveBeenCalledWith(
      "hk",
      { key: undefined, cursor: undefined, limit: 50 },
      expect.any(AbortSignal),
    );
    expect(result.current.hasNextPage).toBe(false);
  });

  it("Given an opaque cursor, fetches the next page for the same region and key", async () => {
    vi.mocked(getConfigAudit)
      .mockResolvedValueOnce({ items: [], next_cursor: "cursor+1" })
      .mockResolvedValueOnce({ items: [], next_cursor: "" });
    const { Wrapper } = wrapper();
    const { result } = renderHook(
      () => useConfigAudit("admin-1", "us", "search.url"),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });
    expect(getConfigAudit).toHaveBeenLastCalledWith(
      "us",
      { key: "search.url", cursor: "cursor+1", limit: 50 },
      expect.any(AbortSignal),
    );
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.hasNextPage).toBe(false);
  });

  it("Given an audit key change, does not mix records or cursors across keys", async () => {
    vi.mocked(getConfigAudit).mockResolvedValue({
      items: [],
      next_cursor: null,
    });
    const { Wrapper } = wrapper();
    const { result, rerender } = renderHook(
      ({ key }) => useConfigAudit("admin-1", "us", key),
      { initialProps: { key: "search.url" }, wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    rerender({ key: "voice.provider" });
    expect(result.current.data).toBeUndefined();
    await waitFor(() =>
      expect(getConfigAudit).toHaveBeenLastCalledWith(
        "us",
        { key: "voice.provider", cursor: undefined, limit: 50 },
        expect.any(AbortSignal),
      ),
    );
    expect(configKeys.audit("admin-1", "us")).toEqual([
      "runtime-config-audit",
      "admin-1",
      "us",
      "",
    ]);
  });
});
