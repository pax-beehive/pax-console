// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/features/api/errors";
import {
  configErrorDetails,
  getConfig,
  getConfigAudit,
  resetConfig,
  revertConfig,
  setConfig,
  testConfig,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function respond(data: unknown, status = 200) {
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ code: status, data }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("runtime config regional transport", () => {
  it("Given a selected region, reads its snapshot through the same-origin proxy", async () => {
    const snapshot = { region: "hk", revision: 7, entries: [] };
    const fetch = respond(snapshot);
    const controller = new AbortController();
    expect(await getConfig("hk", controller.signal)).toEqual(snapshot);
    expect(fetch).toHaveBeenCalledWith(
      "/api/pax/api/v1/admin/config?region=hk",
      expect.objectContaining({ credentials: "include", cache: "no-store" }),
    );
  });

  it("Given routing that returns another region, rejects the snapshot", async () => {
    respond({ region: "us", revision: 7, entries: [] });
    await expect(getConfig("hk")).rejects.toThrow("region");
  });

  it("Given an update, preserves the contract value, optimistic version and reason", async () => {
    const entry = { key: "search.api_key", version: 4, value: null };
    const fetch = respond(entry);
    const request = {
      value: "new-secret",
      expected_version: 3,
      reason: "HK rollout",
    };
    expect(await setConfig("hk", "search.api_key", request)).toEqual(entry);
    expect(fetch).toHaveBeenCalledWith(
      "/api/pax/api/v1/admin/config/search.api_key?region=hk",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify(request),
        cache: "no-store",
      }),
    );
  });

  it("Given restore defaults, encodes reason and version in the DELETE query", async () => {
    const fetch = respond({ key: "search.url", source: "env", version: 5 });
    await resetConfig("us", "search.url", {
      expected_version: 4,
      reason: "restore & verify",
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/pax/api/v1/admin/config/search.url?region=us&expected_version=4&reason=restore+%26+verify",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("Given unsaved overrides, tests without changing the value contract", async () => {
    const result = { ok: false, latency_ms: 12, message: "connection failed" };
    const fetch = respond(result);
    const request = {
      group: "search",
      overrides: { "search.api_key": "new-secret" },
    };
    expect(await testConfig("hk", request)).toEqual(result);
    expect(fetch).toHaveBeenCalledWith(
      "/api/pax/api/v1/admin/config/test?region=hk",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
  });

  it("Given a connection test that does not finish, aborts at its ten-second deadline", async () => {
    const timeout = new AbortController();
    const timeoutSignal = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeout.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      ),
    );
    const pending = testConfig("us", { group: "search", overrides: {} });
    expect(timeoutSignal).toHaveBeenCalledWith(10_000);
    timeout.abort(
      new DOMException("Connection test timed out", "TimeoutError"),
    );
    await expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("Given an audit filter and cursor, retains both in the selected-region request", async () => {
    const page = { items: [], next_cursor: "next" };
    const fetch = respond(page);
    expect(
      await getConfigAudit("us", {
        key: "search.url",
        cursor: "a+b",
        limit: 25,
      }),
    ).toEqual(page);
    expect(fetch).toHaveBeenCalledWith(
      "/api/pax/api/v1/admin/config/audit?region=us&key=search.url&cursor=a%2Bb&limit=25",
      expect.any(Object),
    );
  });

  it("Given the first audit page, requests the contract's page size", async () => {
    const fetch = respond({ items: [], next_cursor: null });
    await getConfigAudit("hk");
    expect(fetch).toHaveBeenCalledWith(
      "/api/pax/api/v1/admin/config/audit?region=hk&limit=50",
      expect.any(Object),
    );
  });

  it("Given rollback, sends the current version instead of the historical version", async () => {
    const fetch = respond({ key: "search.index", version: 9 });
    const request = { expected_version: 8, reason: "rollback rollout" };
    await revertConfig("hk", 17, request);
    expect(fetch).toHaveBeenCalledWith(
      "/api/pax/api/v1/admin/config/audit/17/revert?region=hk",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(request),
      }),
    );
  });
});

describe("runtime config errors", () => {
  it("Given conflict metadata, exposes the authoritative current version", () => {
    const error = new ApiError("version conflict", 409, {
      data: { error: "version_conflict", version: 8 },
    });
    expect(configErrorDetails(error)).toEqual({
      status: 409,
      code: "version_conflict",
      version: 8,
      fieldErrors: undefined,
    });
  });

  it("Given validation metadata, preserves safe field errors", () => {
    const error = new ApiError("validation failed", 400, {
      data: {
        error: "validation_failed",
        field_errors: { value: "must be a URL" },
      },
    });
    expect(configErrorDetails(error).fieldErrors).toEqual({
      value: "must be a URL",
    });
  });

  it("Given malformed or unrelated errors, does not invent contract metadata", () => {
    expect(configErrorDetails(new Error("offline"))).toEqual({});
    expect(configErrorDetails(new ApiError("failure", 500, null))).toEqual({
      status: 500,
    });
    expect(
      configErrorDetails(
        new ApiError("failure", 400, {
          data: { field_errors: { value: 4 }, version: "4" },
        }),
      ),
    ).toEqual({
      status: 400,
      code: undefined,
      version: undefined,
      fieldErrors: undefined,
    });
  });
});
