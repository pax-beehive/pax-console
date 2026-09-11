import { apiFetch, userPath } from "@/features/api/client";

export type BrowserState = {
  policy: { revision?: number; paused: boolean; origins: string[] };
  pending: { id: string; origin: string; session: string; decision: string }[];
  grants: { session: string; origin: string; expires: number }[];
  sensitiveSessions: string[];
  workers: { session: string; seen: number }[];
  operator: string | null;
  audit: {
    at: string;
    event: string;
    session?: string;
    origin?: string;
    outcome?: string;
  }[];
};
export type BrowserTabs = {
  tabs: { id: string; title: string; restricted: boolean }[];
  activeTabID?: string;
};
export type BrowserFrame = {
  pointer?: { x: number; y: number; action: string; at: number };
  frame: string;
  image: string;
  width: number;
  height: number;
};
export type BrowserOperation =
  | "state"
  | "policy"
  | "decide"
  | "revoke"
  | "secret"
  | "resume_sensitive"
  | "view"
  | "vnc_open"
  | "vnc_exchange"
  | "vnc_close";

// Serializes this panel's transient operations. Never retry an input operation.
const tails = new Map<string, Promise<unknown>>();
export function browserControl<T>(
  userId: string,
  nodeId: string,
  operation: BrowserOperation,
  payload: unknown = {},
): Promise<T> {
  const key = `${userId}/${nodeId}`;
  const work = (tails.get(key) ?? Promise.resolve()).then(async () => {
    const result = await apiFetch<{
      browser_control?: T & { error?: string };
      error?: { message?: string };
    }>(
      userPath(userId, `/nodes/${encodeURIComponent(nodeId)}/daemon/browser`),
      { method: "POST", body: JSON.stringify({ operation, payload }) },
    );
    if (result.error || !result.browser_control)
      throw Error(result.error?.message ?? "Browser control unavailable");
    if (result.browser_control.error) throw Error(result.browser_control.error);
    if (
      operation === "state" &&
      !Array.isArray((result.browser_control as { workers?: unknown }).workers)
    ) {
      throw Error(
        "Update and restart the node browser control service before opening this panel",
      );
    }
    if (
      operation === "view" &&
      (payload as { action?: { type?: string } })?.action?.type === "screenshot"
    ) {
      const frame = result.browser_control as Partial<BrowserFrame>;
      if (
        typeof frame.image !== "string" ||
        !frame.image ||
        typeof frame.frame !== "string" ||
        typeof frame.width !== "number" ||
        !Number.isFinite(frame.width) ||
        frame.width <= 0 ||
        typeof frame.height !== "number" ||
        !Number.isFinite(frame.height) ||
        frame.height <= 0
      ) {
        throw Error(
          "Browser returned no usable image. Update and reconnect the browser runtime if this persists.",
        );
      }
    }
    if (
      operation === "view" &&
      (payload as { action?: { type?: string } })?.action?.type === "tabs" &&
      !Array.isArray((result.browser_control as Partial<BrowserTabs>).tabs)
    ) {
      throw Error(
        "Browser tab list unavailable. Update and reconnect the browser runtime.",
      );
    }
    return result.browser_control;
  });
  const tail = work.catch(() => {});
  tails.set(key, tail);
  void tail.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return work;
}
