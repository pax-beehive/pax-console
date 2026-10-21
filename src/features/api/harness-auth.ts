import { apiFetch, userPath } from "./client";

export const authHarnesses = [
  "claude",
  "codex",
  "pi",
  "kimi",
  "gemini",
  "kiro",
  "hermes",
  "openclaw",
  "opencode",
  "dsh",
  "dscode",
  "antigravity",
] as const;
export type AuthHarness = (typeof authHarnesses)[number];
export type AuthEvent = {
  version: 1;
  type: string;
  id?: string;
  kind?: "text" | "secret" | "select";
  message?: string;
  url?: string;
  code?: string;
  options?: { id: string; label?: string }[];
};
export type AuthResult = {
  harness: string;
  state: string;
  message?: string;
  providers?: { id: string; methods?: string[]; credential_type?: string }[];
};
export type AuthAttempt = {
  protocol_version?: 1;
  harness: AuthHarness;
  session_id?: string;
  state: string;
  expires_at?: string;
  error_code?: string;
  prompt?: AuthEvent;
  events?: AuthEvent[];
  result?: AuthResult;
};
export type AuthCommand = {
  command_id: string;
  harness: AuthHarness;
  operation: "start" | "submit" | "cancel";
  action?: "login" | "logout";
  provider?: string;
  profile?: string;
  method?: string;
  secret_stdin?: boolean;
  session_id?: string;
  prompt_id?: string;
  code?: string;
};
type AuthResponse = {
  harness_auth?: AuthAttempt;
  error?: { code: string; message: string };
};
type AuthAck = {
  command_ack: {
    ok: boolean;
    status: string;
    result?: { harness_auth?: AuthAttempt };
    error?: { code: string; message: string };
  };
};

export async function commandHarnessAuth(
  userId: string,
  nodeId: string,
  command: AuthCommand,
) {
  const response = await apiFetch<AuthAck>(
    userPath(userId, `/nodes/${nodeId}/harness/auth`),
    { method: "POST", cache: "no-store", body: JSON.stringify(command) },
  );
  if (!response.command_ack?.ok || !response.command_ack.result?.harness_auth)
    throw new Error(
      response.command_ack?.error?.message ??
        "The node did not acknowledge authentication. Recover the existing attempt before retrying.",
    );
  if (response.command_ack.result.harness_auth.protocol_version !== 1)
    throw new Error("Update paxd and paxl to support Console authentication.");
  return response.command_ack.result.harness_auth;
}
export class HarnessAuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "HarnessAuthError";
  }
}
export async function getHarnessAuth(
  userId: string,
  nodeId: string,
  input: {
    harness: AuthHarness;
    session_id?: string;
    command_id?: string;
    provider?: string;
    operation?: "status" | "methods";
  },
) {
  const response = await apiFetch<AuthResponse>(
    userPath(
      userId,
      `/nodes/${nodeId}/harness/auth?${new URLSearchParams(Object.entries(input).filter(([, v]) => v !== undefined) as [string, string][]).toString()}`,
    ),
    { cache: "no-store" },
  );
  if (response.error)
    throw new HarnessAuthError(response.error.code, response.error.message);
  if (!response.harness_auth)
    throw new Error("The node returned no authentication state.");
  if (
    (input.session_id || input.command_id) &&
    response.harness_auth.protocol_version !== 1
  )
    throw new HarnessAuthError(
      "unsupported_protocol",
      "Update paxd and paxl to support Console authentication.",
    );
  return response.harness_auth;
}
