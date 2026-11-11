import { apiFetch, userPath } from "@/features/api/client";

export type MobileSession = {
  id: string;
  deviceId: string;
  template: string;
  state: string;
  takeover: boolean;
  recoveryRequired: boolean;
  createdAt: string;
};
export type MobileState = {
  available: boolean;
  mode: "screenshots-and-recordings";
  remoteWebRTC: false;
  templates: { name: string; available: boolean }[];
  sessions: MobileSession[];
};
export type MobileFrame = {
  mime: "image/png";
  data: string;
  width: number;
  height: number;
  frameId: string;
};
export type MobileRecording = {
  id: string;
  kind: "screen" | "audio";
  state: string;
  startedAt: string;
  durationSec: number;
  bytes: number;
  validation?: string;
  error?: string;
};
export type MobileOperation =
  | "state"
  | "templates"
  | "takeover"
  | "release"
  | "screenshot"
  | "tap"
  | "swipe"
  | "text"
  | "key"
  | "recording_start"
  | "recording_stop"
  | "recording_list"
  | "recording_read";

const tails = new Map<string, Promise<unknown>>();

// All access uses the authenticated node bridge. An uncertain input is never retried.
export function mobileControl<T>(
  userId: string,
  nodeId: string,
  operation: MobileOperation,
  payload: unknown = {},
  signal?: AbortSignal,
): Promise<T> {
  const key = `${userId}/${nodeId}`;
  const work = (tails.get(key) ?? Promise.resolve()).then(async () => {
    signal?.throwIfAborted();
    const result = await apiFetch<{
      mobile_control?: T;
      error?: { message?: string };
    }>(userPath(userId, `/nodes/${encodeURIComponent(nodeId)}/daemon/mobile`), {
      method: "POST",
      body: JSON.stringify({ operation, payload }),
      signal,
    });
    if (result.error || result.mobile_control == null)
      throw Error(result.error?.message ?? "Android control unavailable");
    if (
      operation === "state" &&
      (!Array.isArray(
        (result.mobile_control as Partial<MobileState>).sessions,
      ) ||
        !Array.isArray(
          (result.mobile_control as Partial<MobileState>).templates,
        ) ||
        (result.mobile_control as Partial<MobileState>).remoteWebRTC !== false)
    )
      throw Error(
        "Android preview is unavailable. Ask the agent to check this node's setup.",
      );
    if (operation === "screenshot") {
      const frame = result.mobile_control as unknown as MobileFrame;
      if (
        frame.mime !== "image/png" ||
        typeof frame.data !== "string" ||
        !frame.data ||
        frame.data.length > 4 * 1024 * 1024 - 4096 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(frame.data) ||
        !/^[a-f0-9-]{36}$/.test(frame.frameId) ||
        !Number.isInteger(frame.width) ||
        frame.width < 1 ||
        frame.width > 16384 ||
        !Number.isInteger(frame.height) ||
        frame.height < 1 ||
        frame.height > 16384
      )
        throw Error(
          "Android returned no usable screenshot. Refresh before controlling it.",
        );
    }
    if (operation === "recording_list" && !Array.isArray(result.mobile_control))
      throw Error("Android recording list unavailable. Refresh the panel.");
    return result.mobile_control;
  });
  const tail = work.catch(() => {});
  tails.set(key, tail);
  void tail.finally(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return work;
}

type RecordingChunk = {
  id: string;
  mime: "audio/ogg" | "video/x-matroska";
  data: string;
  offset: number;
  length: number;
  totalBytes: number;
  eof: boolean;
};

export async function readMobileRecording(
  userId: string,
  nodeId: string,
  sessionId: string,
  recordingId: string,
  options: {
    signal?: AbortSignal;
    progress?: (received: number, total: number) => void;
  } = {},
) {
  const parts: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  let total: number | undefined;
  let mime: RecordingChunk["mime"] | undefined;
  for (;;) {
    options.signal?.throwIfAborted();
    const chunk = await mobileControl<RecordingChunk>(
      userId,
      nodeId,
      "recording_read",
      {
        sessionId,
        recordingId,
        offset,
        length: 262144,
      },
      options.signal,
    );
    if (
      chunk.id !== recordingId ||
      chunk.offset !== offset ||
      !Number.isSafeInteger(chunk.totalBytes) ||
      chunk.totalBytes < 1 ||
      chunk.totalBytes > 256 * 1024 * 1024 ||
      !Number.isSafeInteger(chunk.length) ||
      chunk.length < 1 ||
      chunk.length > 262144 ||
      !["audio/ogg", "video/x-matroska"].includes(chunk.mime) ||
      typeof chunk.data !== "string" ||
      chunk.data.length > 349528 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(chunk.data) ||
      (total !== undefined && total !== chunk.totalBytes) ||
      (mime !== undefined && mime !== chunk.mime)
    )
      throw Error(
        "Recording changed or returned an invalid chunk. Load it again explicitly.",
      );
    const bytes = Uint8Array.from(atob(chunk.data), (character) =>
      character.charCodeAt(0),
    );
    total = chunk.totalBytes;
    mime = chunk.mime;
    if (
      bytes.length !== chunk.length ||
      offset + bytes.length > total ||
      chunk.eof !== (offset + bytes.length === total)
    )
      throw Error("Recording chunk bounds are invalid.");
    parts.push(bytes);
    offset += bytes.length;
    options.progress?.(offset, total);
    if (chunk.eof) return { blob: new Blob(parts, { type: mime }), mime };
  }
}
