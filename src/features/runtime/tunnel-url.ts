import { API_BASE_URL } from "../api/client";
import { getPublicRuntimeConfig } from "./public-runtime-config";

const DEFAULT_WS_BASE_URL = "wss://api.paxworkspace.net";
const LEGACY_CONSOLE_HOSTNAME = "ws.lakeward.net";
const LEGACY_WS_BASE_URL = "wss://api.lakeward.net";

export function resolveHostedWsBaseUrl(hostname?: string) {
  const browserHostname =
    hostname ??
    (typeof window === "undefined" ? undefined : window.location.hostname);
  return browserHostname?.toLowerCase() === LEGACY_CONSOLE_HOSTNAME
    ? LEGACY_WS_BASE_URL
    : DEFAULT_WS_BASE_URL;
}

export function getAgentTunnelUrl(agentId: string, sessionId?: string) {
  const wsBaseUrl =
    getPublicRuntimeConfig()?.wsBaseUrl ??
    process.env.NEXT_PUBLIC_PAX_WS_BASE_URL ??
    (API_BASE_URL.startsWith("http") ? API_BASE_URL : resolveHostedWsBaseUrl());
  const baseUrl = new URL(wsBaseUrl);
  if (baseUrl.protocol === "http:") {
    baseUrl.protocol = "ws:";
  }
  if (baseUrl.protocol === "https:") {
    baseUrl.protocol = "wss:";
  }
  baseUrl.pathname = `/api/v1/user/self/agents/${agentId}/tunnel`;
  baseUrl.search = "";
  if (sessionId) {
    baseUrl.searchParams.set("session_id", sessionId);
  }
  return baseUrl.toString();
}
