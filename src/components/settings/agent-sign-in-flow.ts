"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getNodeHarnessAuth, loginNodeHarness } from "@/features/api/resources";
import { ApiError, AuthError } from "@/features/api/errors";
import type {
  HarnessAuthView,
  HarnessLoginInput,
  LoginHarness,
} from "@/features/api/types";

const pendingStates = new Set([
  "starting",
  "awaiting_code",
  "awaiting_browser",
  "exchanging",
]);

export function loginPending(view?: HarnessAuthView | null) {
  return Boolean(view && pendingStates.has(view.state));
}

export function validLoginSecret(value: string) {
  return (
    value.length > 0 &&
    value.trim() === value &&
    !/[\r\n\0]/.test(value) &&
    new TextEncoder().encode(value).length <= 4096
  );
}

export function safeAuthorizationUrl(harness: LoginHarness, value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    if (harness === "codex") {
      return url.href === "https://auth.openai.com/codex/device"
        ? url.href
        : null;
    }
    if (
      ![
        "claude.com",
        "claude.ai",
        "console.anthropic.com",
        "platform.claude.com",
      ].includes(url.hostname) ||
      !["/cai/oauth/authorize", "/oauth/authorize"].includes(url.pathname) ||
      !url.searchParams.get("state") ||
      !url.searchParams.get("code_challenge") ||
      url.searchParams.get("response_type") !== "code"
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function publicLoginError(error: unknown) {
  if (error instanceof AuthError)
    return "Your PAX account could not access this device. Refresh the page to check your account.";
  if (error instanceof ApiError) {
    switch (error.status) {
      case 404:
        return "Remote sign-in is unavailable, or this attempt no longer exists. Refresh status and check that Manager and paxd are up to date.";
      case 409:
        return "Another sign-in attempt is active on this device. Refresh status, complete or cancel that attempt, then retry.";
      case 400:
        return "The sign-in request was rejected. Check the selected method and enter the complete, single-line code or credential.";
      case 503:
        return "The device is offline or remote sign-in is unavailable. Reconnect the device and refresh status.";
      case 504:
        return "The device did not respond in time. Refresh status before starting another attempt.";
    }
  }
  // Native output and error bodies can include secrets. Only display our text.
  return "Could not contact the device. Refresh status before trying again.";
}

function sanitizeView(view: HarnessAuthView): HarnessAuthView {
  if (
    loginPending(view) &&
    view.expires_at &&
    Date.parse(view.expires_at) <= Date.now()
  )
    view = { ...view, state: "expired" };
  if (loginPending(view)) return view;
  return { ...view, authorization_url: undefined, user_code: undefined };
}

/** Challenges and secret action payloads belong only to this mounted surface. */
export function useAgentSignIn(
  userId: string,
  nodeId: string,
  harness: LoginHarness,
) {
  const [view, setView] = useState<HarnessAuthView | null>(null);
  const latestView = useRef<HarnessAuthView | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const action = useRef<AbortController | null>(null);
  const polling = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const applyView = useCallback((next: HarnessAuthView) => {
    const sanitized = sanitizeView(next);
    latestView.current = sanitized;
    setView(sanitized);
    return sanitized;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      action.current?.abort();
      latestView.current = null;
    };
  }, []);

  useEffect(() => {
    const currentSequence = ++sequence.current;
    const controller = new AbortController();
    polling.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      if (controller.signal.aborted || currentSequence !== sequence.current)
        return;
      setChecking(true);
      try {
        const data = await getNodeHarnessAuth(
          userId,
          nodeId,
          harness,
          latestView.current?.session_id,
          controller.signal,
        );
        if (controller.signal.aborted || currentSequence !== sequence.current)
          return;
        const current = applyView(data.harness_auth);
        setError("");
        if (loginPending(current)) timer = setTimeout(read, 2000);
      } catch (cause) {
        if (!controller.signal.aborted && currentSequence === sequence.current)
          setError(publicLoginError(cause));
      } finally {
        if (!controller.signal.aborted && currentSequence === sequence.current)
          setChecking(false);
      }
    };
    void read();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [applyView, harness, nodeId, revision, userId]);

  useEffect(() => {
    if (!view?.expires_at || !loginPending(view)) return;
    const deadline = Date.parse(view.expires_at);
    if (!Number.isFinite(deadline)) return;
    const timer = setTimeout(
      () => {
        applyView({ ...view, state: "expired" });
      },
      Math.max(0, deadline - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [applyView, view]);

  const refresh = useCallback(() => {
    // A daemon restart can remove a handle. Reconcile the latest owned attempt
    // or current credentials instead of repeatedly requesting a vanished ID.
    latestView.current = null;
    setRevision((value) => value + 1);
  }, []);

  const run = async (input: Omit<HarnessLoginInput, "command_id">) => {
    if (action.current) return;
    const currentSequence = ++sequence.current;
    const controller = new AbortController();
    polling.current?.abort();
    action.current = controller;
    setBusy(true);
    setChecking(false);
    setError("");
    let accepted = false;
    try {
      const data = await loginNodeHarness(
        userId,
        nodeId,
        harness,
        { ...input, command_id: crypto.randomUUID() },
        controller.signal,
      );
      if (mounted.current && currentSequence === sequence.current) {
        applyView(data.harness_auth);
        accepted = true;
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted)
        setError(publicLoginError(cause));
    } finally {
      action.current = null;
      if (mounted.current) {
        setBusy(false);
        if (accepted) setRevision((value) => value + 1);
      }
    }
  };

  return { view, checking, busy, error, refresh, run };
}
