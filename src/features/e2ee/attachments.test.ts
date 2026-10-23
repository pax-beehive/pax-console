import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  encryptAttachment,
  attachmentKey,
  attachmentChunkParameters,
  ATTACHMENT_CHUNK_BYTES,
  stageEncryptedAttachment,
  uploadEncryptedAttachment,
} from "./attachments";

vi.stubGlobal("crypto", webcrypto);
vi.mock("@/features/api/resources", () => ({
  createUserAttachment: vi.fn(),
  completeUserAttachment: vi.fn(),
}));
vi.mock("@/features/api/client", () => ({
  apiFetch: vi.fn(),
  userPath: (user: string, path: string) => `/users/${user}${path}`,
}));
const context = {
  agent_id: "agent_1",
  session_id: "session_1",
  key_epoch: 1,
  attachment_id: "file_1",
};
const root = new Uint8Array(32).fill(7);

describe("encrypted attachment protocol", () => {
  it("matches the Go compatibility vector", async () => {
    const result = await encryptAttachment(new Blob(["hello"]), root, context);
    expect(Buffer.from(await result.arrayBuffer()).toString("hex")).toBe(
      "c7b43e3b2c8d2c8c3889e4fd64e437d0710b4bdbbd",
    );
  });
  it("authenticates ordered chunks and isolates sessions", async () => {
    const plain = new Uint8Array(ATTACHMENT_CHUNK_BYTES + 3).fill(42);
    const result = await encryptAttachment(new Blob([plain]), root, context);
    expect(result.size).toBe(plain.length + 32);
    const key = await attachmentKey(root, context);
    const bytes = await result.arrayBuffer();
    const chunk = bytes.slice(0, ATTACHMENT_CHUNK_BYTES + 16);
    const decoded = await crypto.subtle.decrypt(
      attachmentChunkParameters(context, plain.length, 2, 0),
      key,
      chunk,
    );
    expect(
      Buffer.from(decoded).equals(
        Buffer.from(plain.slice(0, ATTACHMENT_CHUNK_BYTES)),
      ),
    ).toBe(true);
    await expect(
      crypto.subtle.decrypt(
        attachmentChunkParameters(context, plain.length, 2, 1),
        key,
        chunk,
      ),
    ).rejects.toThrow();
    const otherKey = await attachmentKey(root, {
      ...context,
      session_id: "other",
    });
    await expect(
      crypto.subtle.decrypt(
        attachmentChunkParameters(context, plain.length, 2, 0),
        otherKey,
        chunk,
      ),
    ).rejects.toThrow();
  });
  it("authenticates empty files and stops on cancellation", async () => {
    expect((await encryptAttachment(new Blob([]), root, context)).size).toBe(
      16,
    );
    const controller = new AbortController();
    controller.abort();
    await expect(
      encryptAttachment(new Blob(["x"]), root, context, controller.signal),
    ).rejects.toThrow();
  });
  it("stages plaintext only in the browser", () => {
    const file = new File(["secret"], "private.txt");
    expect(stageEncryptedAttachment(file).encryptedFile).toBe(file);
  });
  it("uploads only ciphertext and opaque metadata, and refreshes the ticket on retry", async () => {
    const { createUserAttachment, completeUserAttachment } =
      await import("@/features/api/resources");
    const { apiFetch } = await import("@/features/api/client");
    vi.mocked(createUserAttachment).mockResolvedValue({
      attachment: { attachment_id: "att_1" },
      upload: {
        protocol: "s3_presigned_put",
        url: "https://storage.test/object",
        headers: {},
      },
    } as never);
    vi.mocked(completeUserAttachment).mockResolvedValue({} as never);
    vi.mocked(apiFetch).mockResolvedValue({ url: "https://storage.test/read" });
    const bodies: Blob[] = [];
    class Upload {
      upload = { onprogress: undefined };
      status = 200;
      onload?: () => void;
      open() {}
      setRequestHeader() {}
      abort() {}
      send(blob: Blob) {
        bodies.push(blob);
        this.onload?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", Upload);
    const file = new File(["super secret"], "private.txt");
    const descriptor = await uploadEncryptedAttachment(
      file,
      root,
      context,
      "owner",
    );
    expect(descriptor.filename).toBe("private.txt");
    expect(createUserAttachment).toHaveBeenCalledWith(
      "owner",
      expect.objectContaining({
        content_type: "application/octet-stream",
        size_bytes: 28,
      }),
    );
    expect(
      JSON.stringify(vi.mocked(createUserAttachment).mock.calls),
    ).not.toContain("private.txt");
    expect(await bodies[0].text()).not.toContain("super secret");
    await uploadEncryptedAttachment(file, root, context, "owner");
    expect(bodies).toHaveLength(1);
    expect(apiFetch).toHaveBeenCalledTimes(2);
  });
});
