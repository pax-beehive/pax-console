import { ApiError, AuthError } from "./errors";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_PAX_API_BASE_URL ?? "/api/pax";

export const API_USER_SCOPE =
  process.env.NEXT_PUBLIC_PAX_USER_SCOPE ?? "self";

type ApiEnvelope<T> = {
  code: number;
  data: T;
  message?: string;
};

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // Browser code should call the same-origin proxy by default. That keeps
  // Cloudflare Access and CORS handling on the Next server side in local dev.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  const headers = new Headers(init?.headers);
  const method = init?.method ?? "GET";

  // Do not attach Content-Type to GET requests; doing so turns simple reads
  // into CORS preflights when the base URL is ever pointed at a remote origin.
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    redirect: init?.redirect ?? "manual",
    headers,
    method,
    signal: init?.signal ?? controller.signal,
  }).finally(() => window.clearTimeout(timeout));

  if (
    response.status === 0 ||
    response.status === 401 ||
    response.status === 403 ||
    (response.status >= 300 && response.status < 400) ||
    response.type === "opaqueredirect"
  ) {
    throw new AuthError();
  }

  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    throw new ApiError(
      `Expected JSON response from PAX API, received ${contentType ?? "unknown content type"}`,
      response.status,
      null,
    );
  }

  const body = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || body.code >= 400) {
    throw new ApiError(
      body.message ?? "PAX API request failed",
      response.status,
      body,
    );
  }

  return body.data;
}

export function userPath(userId: string, path: string) {
  return `/api/v1/user/${userId}${path}`;
}
