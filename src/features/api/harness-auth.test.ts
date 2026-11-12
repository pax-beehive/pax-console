import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("./client", () => ({
  apiFetch: mocks.apiFetch,
  userPath: (userId: string, path: string) => `/api/v1/user/${userId}${path}`,
}));

import {
  getNodeHarnessAuth,
  getNodeHarnessUsage,
  loginNodeHarness,
} from "./resources";

afterEach(() => vi.clearAllMocks());

it("reads ephemeral login status with encoded IDs, cancellation and no-store", async () => {
  const signal = new AbortController().signal;
  await getNodeHarnessAuth("self", "node/one", "claude", "login&one", signal);
  expect(mocks.apiFetch).toHaveBeenCalledWith(
    "/api/v1/user/self/nodes/node%2Fone/harnesses/claude/auth/status?session_id=login%26one",
    { cache: "no-store", signal },
  );
  await getNodeHarnessAuth("self", "one", "codex");
  expect(mocks.apiFetch).toHaveBeenLastCalledWith(
    "/api/v1/user/self/nodes/one/harnesses/codex/auth/status",
    { cache: "no-store", signal: undefined },
  );
});

it("reads plan usage separately from sign-in with encoded IDs and no-store", async () => {
  const signal = new AbortController().signal;
  await getNodeHarnessUsage("self", "node/one", "claude", signal);
  expect(mocks.apiFetch).toHaveBeenCalledWith(
    "/api/v1/user/self/nodes/node%2Fone/harnesses/claude/usage",
    { cache: "no-store", signal },
  );
  await getNodeHarnessUsage("self", "one", "codex");
  expect(mocks.apiFetch).toHaveBeenLastCalledWith(
    "/api/v1/user/self/nodes/one/harnesses/codex/usage",
    { cache: "no-store", signal: undefined },
  );
});

it.each([
  { operation: "start", method: "subscription" },
  { operation: "start", method: "console" },
  { operation: "start", method: "device" },
  { operation: "start", method: "api-key", code: "secret" },
  { operation: "start", method: "access-token", code: "secret" },
  { operation: "submit", session_id: "login-one", code: "full#state" },
  { operation: "cancel", session_id: "login-one" },
] as const)(
  "sends $operation $method only as an ephemeral POST",
  async (input) => {
    const signal = new AbortController().signal;
    const body = { command_id: "command-one", ...input };
    await loginNodeHarness("self", "node/one", "claude", body, signal);
    expect(mocks.apiFetch).toHaveBeenCalledWith(
      "/api/v1/user/self/nodes/node%2Fone/harnesses/claude/auth/login",
      { method: "POST", cache: "no-store", signal, body: JSON.stringify(body) },
    );
  },
);
