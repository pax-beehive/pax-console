/* @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getSecretaryGuidance,
  getSecretaryOperation,
  prepareSecretaryOperation,
  saveSecretaryGuidance,
  secretaryInstructionError,
  submitSecretaryOperation,
  useSubmitSecretaryOperation,
  useSecretaryGuidance,
  secretaryControlKeys,
} from "./secretary-control";

const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ code: status, data, message: "conflict" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Secretary user control API", () => {
  it("rechecks guidance access on mount even when the shared cache considers it fresh", async () => {
    fetchMock.mockImplementation(async () => response({}, 404));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    clients.push(client);
    client.setQueryData(
      secretaryControlKeys.guidance("self", "session", "42"),
      {
        scope: "session",
        source_id: "42",
        revision: 1,
        instruction: "Cached requirements",
      },
    );
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () => useSecretaryGuidance("self", "session", "42"),
      { wrapper },
    );
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("separates user and session requirements through same-origin routes and sends CAS revisions", async () => {
    fetchMock.mockImplementation(async () => response({}));
    await getSecretaryGuidance("self", "user");
    await saveSecretaryGuidance("self", "session", "42", "Keep decisions", 3);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/guidance?scope=user",
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/guidance?scope=session&source_id=42",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      instruction: "Keep decisions",
      expected_revision: 3,
    });
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PUT");
  });
  it("freezes a selected range and submits separate processed and representative source sets", async () => {
    fetchMock.mockImplementation(async () => response({}));
    await prepareSecretaryOperation("self", {
      source_id: "42",
      kind: "human_summary",
      scope: "selected",
      message_ids: ["m1", "m2"],
      owner_user_id: "other",
    } as Parameters<typeof prepareSecretaryOperation>[1]);
    await submitSecretaryOperation("self", "op/1", {
      request_id: "request",
      expected_revision: 1,
      message_ids: ["m1", "m2"],
      coverage_message_ids: ["m2"],
      title: "Repeated deployments",
      body: "Multiple manual deployments.",
      confirm_replace: true,
      owner_user_id: "other",
    } as Parameters<typeof submitSecretaryOperation>[2]);
    await getSecretaryOperation("self", "op/1");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/operations/prepare",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      source_id: "42",
      kind: "human_summary",
      scope: "selected",
      message_ids: ["m1", "m2"],
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      "/api/pax/api/v1/user/self/secretary/operations/op%2F1/submit",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      request_id: "request",
      expected_revision: 1,
      message_ids: ["m1", "m2"],
      coverage_message_ids: ["m2"],
      title: "Repeated deployments",
      body: "Multiple manual deployments.",
      confirm_replace: true,
    });
    expect(fetchMock.mock.calls[2][1]?.method).toBe("GET");
  });
  it.each([409, 503])(
    "never automatically repeats a submit after HTTP %s",
    async (status) => {
      fetchMock.mockImplementation(async () => response({}, status));
      const client = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });
      clients.push(client);
      const wrapper = ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      );
      const hook = renderHook(() => useSubmitSecretaryOperation("self", "op"), {
        wrapper,
      });
      act(() =>
        hook.result.current.mutate({
          request_id: "same-request",
          expected_revision: 1,
          run_instruction: "Group repeated activity",
        }),
      );
      await waitFor(() => expect(hook.result.current.isError).toBe(true));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it("validates character and UTF-8 limits without rejecting valid multibyte requirements", () => {
    expect(secretaryInstructionError("a".repeat(4096))).toBeUndefined();
    expect(secretaryInstructionError("\u4e2d".repeat(2730))).toBeUndefined();
    expect(secretaryInstructionError("\u4e2d".repeat(2731))).toBeTruthy();
    expect(secretaryInstructionError("a".repeat(4097))).toBeTruthy();
    expect(secretaryInstructionError("a\0b")).toBeTruthy();
    expect(secretaryInstructionError(" ")).toBeUndefined();
  });
});
