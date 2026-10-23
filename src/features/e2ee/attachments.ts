import { apiFetch, userPath } from "@/features/api/client";
import {
  createUserAttachment,
  completeUserAttachment,
} from "@/features/api/resources";

export const ATTACHMENT_CHUNK_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 512 * 1024 * 1024;
export type AttachmentContext = {
  agent_id: string;
  session_id: string;
  key_epoch: number;
  attachment_id: string;
};
export type EncryptedAttachment = AttachmentContext & {
  version: 1;
  filename: string;
  content_type: string;
  size_bytes: number;
  chunk_count: number;
  object_id: string;
  download_url: string;
};
export type PendingEncryptedAttachment = {
  attachmentId: string;
  filename: string;
  contentType?: string;
  sizeBytes?: number;
  encryptedFile?: File;
};

export function stageEncryptedAttachment(
  file: File,
): PendingEncryptedAttachment {
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new Error("Encrypted attachments are limited to 512 MiB");
  return {
    attachmentId: crypto.randomUUID(),
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
    encryptedFile: file,
  };
}

export async function attachmentKey(
  rootKey: Uint8Array,
  context: AttachmentContext,
) {
  if (
    rootKey.length !== 32 ||
    !Number.isSafeInteger(context.key_epoch) ||
    context.key_epoch < 1 ||
    [context.agent_id, context.session_id, context.attachment_id].some(
      (value) => !value || value.includes("\0"),
    )
  ) {
    throw new Error("Invalid encrypted attachment context");
  }
  const root = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(rootKey).buffer,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const info = `pax/e2ee/v1/attachment\0${context.agent_id}\0${context.session_id}\0${context.key_epoch}\0${context.attachment_id}`;
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(info),
    },
    root,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function attachmentChunkParameters(
  context: AttachmentContext,
  size: number,
  count: number,
  index: number,
) {
  const nonce = new Uint8Array(12);
  new DataView(nonce.buffer).setUint32(8, index, false);
  const aad = JSON.stringify([
    1,
    "pax/e2ee/attachment",
    context.agent_id,
    context.session_id,
    String(context.key_epoch),
    context.attachment_id,
    size,
    count,
    index,
  ]);
  return {
    name: "AES-GCM",
    iv: nonce,
    additionalData: new TextEncoder().encode(aad),
    tagLength: 128,
  };
}

export async function encryptAttachment(
  file: Blob,
  rootKey: Uint8Array,
  context: AttachmentContext,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
) {
  if (file.size > MAX_ATTACHMENT_BYTES)
    throw new Error("Encrypted attachments are limited to 512 MiB");
  const key = await attachmentKey(rootKey, context);
  const count = Math.max(1, Math.ceil(file.size / ATTACHMENT_CHUNK_BYTES));
  const chunks: ArrayBuffer[] = [];
  for (let index = 0; index < count; index++) {
    signal?.throwIfAborted();
    const plain = await file
      .slice(
        index * ATTACHMENT_CHUNK_BYTES,
        (index + 1) * ATTACHMENT_CHUNK_BYTES,
      )
      .arrayBuffer();
    chunks.push(
      await crypto.subtle.encrypt(
        attachmentChunkParameters(context, file.size, count, index),
        key,
        plain,
      ),
    );
    onProgress?.(
      Math.min((index + 1) * ATTACHMENT_CHUNK_BYTES, file.size),
      file.size,
    );
  }
  return new Blob(chunks, { type: "application/octet-stream" });
}

// Cached ciphertext/tickets remain browser-local. A retry never re-encrypts a
// changed file under the same ID, and obtains a fresh download capability.
const uploads = new WeakMap<
  File,
  Map<string, Promise<Omit<EncryptedAttachment, "download_url">>>
>();
export async function uploadEncryptedAttachment(
  file: File,
  rootKey: Uint8Array,
  session: Omit<AttachmentContext, "attachment_id">,
  userId: string,
  signal?: AbortSignal,
  onProgress?: (phase: string, percent: number) => void,
): Promise<EncryptedAttachment> {
  signal?.throwIfAborted();
  const scope = JSON.stringify([userId, session]);
  let entries = uploads.get(file);
  if (!entries) {
    entries = new Map();
    uploads.set(file, entries);
  }
  let pending = entries.get(scope);
  if (!pending) {
    pending = (async () => {
      const context = { ...session, attachment_id: crypto.randomUUID() };
      const ciphertext = await encryptAttachment(
        file,
        rootKey,
        context,
        signal,
        (done, total) =>
          onProgress?.(
            "Encrypting",
            total ? Math.round((done / total) * 100) : 100,
          ),
      );
      signal?.throwIfAborted();
      const ticket = await createUserAttachment(userId, {
        filename: `${context.attachment_id}.paxe`,
        content_type: "application/octet-stream",
        size_bytes: ciphertext.size,
      });
      if (ticket.upload.protocol !== "s3_presigned_put")
        throw new Error("Encrypted upload requires a presigned PUT ticket");
      await uploadCiphertext(
        ticket.upload.url,
        ticket.upload.headers,
        ciphertext,
        signal,
        (percent) => onProgress?.("Uploading", percent),
      );
      signal?.throwIfAborted();
      await completeUserAttachment(userId, ticket.attachment.attachment_id);
      return {
        ...context,
        version: 1 as const,
        filename: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        chunk_count: Math.max(1, Math.ceil(file.size / ATTACHMENT_CHUNK_BYTES)),
        object_id: ticket.attachment.attachment_id,
      };
    })();
    entries.set(scope, pending);
    pending.catch(() => entries!.delete(scope));
  }
  const descriptor = await pending;
  signal?.throwIfAborted();
  const { url } = await apiFetch<{ url: string }>(
    userPath(
      userId,
      `/attachments/${encodeURIComponent(descriptor.object_id)}/content?ticket=1`,
    ),
  );
  return { ...descriptor, download_url: url };
}

function uploadCiphertext(
  url: string,
  headers: Record<string, string> | undefined,
  blob: Blob,
  signal?: AbortSignal,
  onProgress?: (percent: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    signal?.throwIfAborted();
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error) => {
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    xhr.open("PUT", url);
    xhr.withCredentials = false;
    xhr.timeout = 10 * 60 * 1000;
    for (const [name, value] of Object.entries(headers ?? {}))
      xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      finish(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new Error(`Encrypted upload failed (${xhr.status})`),
      );
    xhr.onerror = () => finish(new Error("Encrypted upload request failed"));
    xhr.ontimeout = () => finish(new Error("Encrypted upload timed out"));
    xhr.onabort = () =>
      finish(new DOMException("Attachment upload cancelled", "AbortError"));
    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(blob);
  });
}
