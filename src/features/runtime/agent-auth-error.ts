import { ApiError, AuthError } from "@/features/api/errors";

/** Classify actual agent request errors, never assistant or tool message text. */
export function isAgentAuthenticationError(error: Error | null | undefined) {
  if (!error || error instanceof AuthError) return false;
  if (error instanceof ApiError) {
    const body = error.body;
    if (!body || typeof body !== "object" || !("type" in body)) return false;
    if (body.type !== "error") return false;
  }
  // ACP uses the generic -32000 code for many failures. Match its explicit
  // authentication message until adapters expose a dedicated error kind.
  return /^(authentication required|failed to authenticate: oauth session expired and could not be refreshed)[.!]?$/i.test(
    error.message.trim(),
  );
}
