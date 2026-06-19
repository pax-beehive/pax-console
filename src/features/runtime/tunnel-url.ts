import { API_BASE_URL } from "../api/client";

const DEFAULT_WS_BASE_URL = "wss://app.paxtech.net";

export function getAgentTunnelUrl(agentId: string, sessionId?: string) {
  const wsBaseUrl =
    process.env.NEXT_PUBLIC_PAX_WS_BASE_URL ??
    (API_BASE_URL.startsWith("http") ? API_BASE_URL : DEFAULT_WS_BASE_URL);
  const baseUrl = new URL(wsBaseUrl);
  if (baseUrl.protocol === "http:") {
    baseUrl.protocol = "ws:";
  }
  if (baseUrl.protocol === "https:") {
    baseUrl.protocol = "wss:";
  }
  baseUrl.pathname = sessionId
    ? `/api/v1/user/self/agents/${agentId}/sessions/${sessionId}/tunnel`
    : `/api/v1/user/self/agents/${agentId}/tunnel`;
  baseUrl.search = "";
  return baseUrl.toString();
}
