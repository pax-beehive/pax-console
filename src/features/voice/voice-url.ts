import { API_USER_SCOPE } from "@/features/api/client";
import { browserWebSocketUrl } from "@/features/runtime/tunnel-url";

/** The voice stream uses the same regional WebSocket origin as the tunnel. */
export function getVoiceStreamUrl() {
  return browserWebSocketUrl(
    `/api/v1/user/${API_USER_SCOPE}/voice/stream`,
  ).toString();
}
