import { apiFetch, userPath } from "@/features/api/client";

export type ShortAttempt = {
  attempt_id: string;
  pairing_id: string;
  generation: number;
  stage: number;
  client_hello: string;
  recipient_answer?: string;
  client_finish?: string;
  secret_payload?: string;
  created_at: string;
  expires_at: string;
  confirmation_expires_at?: string;
};
export function shortPairingPath(
  userId: string,
  agentId: string,
  pairingId: string,
) {
  return userPath(
    userId,
    `/agents/${encodeURIComponent(agentId)}/e2ee/pairings/${encodeURIComponent(pairingId)}`,
  );
}
export async function relay<T>(
  path: string,
  capability: string,
  body?: unknown,
  signal?: AbortSignal,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 12_000);
  try {
    return await apiFetch<T>(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: { "X-Pax-Pairing-Capability": capability },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
