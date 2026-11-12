// Wire protocol of the manager voice stream
// (GET /api/v1/user/{user_id}/voice/stream).
//
// Client to server: a JSON start message, binary pcm_s16le frames at the
// advertised sample rate, then JSON stop or cancel.
// Server to client: ready, transcript snapshots, then done or error.

export type VoiceStartMessage = {
  type: "start";
  keywords?: string[];
  context?: string[];
};

export type VoiceServerMessage =
  | { type: "ready"; provider: string; sampleRate: number; encoding: string }
  // Snapshots carry the whole transcript; final text never changes.
  | { type: "transcript"; final: string; partial: string }
  | { type: "done"; final: string }
  | { type: "error"; code: string; message: string };

export function parseVoiceServerMessage(
  data: unknown,
): VoiceServerMessage | undefined {
  if (typeof data !== "string") return undefined;
  let message: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return undefined;
    message = parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const text = (key: string) =>
    typeof message[key] === "string" ? (message[key] as string) : "";
  switch (message.type) {
    case "ready":
      return typeof message.sample_rate === "number" && message.sample_rate > 0
        ? {
            type: "ready",
            provider: text("provider"),
            sampleRate: message.sample_rate,
            encoding: text("encoding"),
          }
        : undefined;
    case "transcript":
      return {
        type: "transcript",
        final: text("final"),
        partial: text("partial"),
      };
    case "done":
      return { type: "done", final: text("final") };
    case "error":
      return { type: "error", code: text("code"), message: text("message") };
    default:
      return undefined;
  }
}
