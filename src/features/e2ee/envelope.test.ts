import { describe, expect, it } from "vitest";
import {
  decodeRootKey,
  decryptEnvelope,
  encodeRootKey,
  encryptEnvelope,
  generateEncodedRootKey,
  type EncryptedEnvelope,
} from "./envelope";

const rootKey = Uint8Array.from({ length: 32 }, (_, index) => index);
const metadata = {
  record_id: "cmd_vector_1",
  agent_id: "agent_vector",
  session_id: "session_vector",
  kind: "acp_command",
  key_epoch: 7,
} as const;

describe("E2EE envelope", () => {
  it("round trips an encrypted command", async () => {
    const plaintext = new TextEncoder().encode(
      '{"jsonrpc":"2.0","id":"request_1","method":"session/prompt"}',
    );

    const envelope = await encryptEnvelope(
      rootKey,
      "command",
      metadata,
      plaintext,
    );

    await expect(
      decryptEnvelope(rootKey, "command", envelope),
    ).resolves.toEqual(plaintext);
    expect(envelope.nonce).not.toBe("");
    expect(envelope.payload).not.toContain("session/prompt");
  });

  it("rejects authenticated metadata changes", async () => {
    const envelope = await encryptEnvelope(
      rootKey,
      "command",
      metadata,
      new TextEncoder().encode("secret"),
    );

    await expect(
      decryptEnvelope(rootKey, "command", {
        ...envelope,
        session_id: "session_changed",
      }),
    ).rejects.toThrow();
  });

  it("decrypts the shared Go compatibility vector", async () => {
    const envelope: EncryptedEnvelope = {
      protocol_version: 1,
      cipher_version: 1,
      key_epoch: 7,
      record_id: "cmd_vector_1",
      agent_id: "agent_vector",
      session_id: "session_vector",
      kind: "acp_command",
      nonce: "AAECAwQFBgcICQoL",
      payload:
        "GcCQKbHNJjmk1yKKWUQmcLKrS6pV6FGkHGpQi4Td1BeDFtE/OtzFYmyzcBjSxOzaG0ws42u2NTlwXuCv4F42mB0xnD57M53gMNcC9g==",
    };

    await expect(
      decryptEnvelope(rootKey, "command", envelope).then((value) =>
        new TextDecoder().decode(value),
      ),
    ).resolves.toBe(
      '{"jsonrpc":"2.0","id":"request_1","method":"session/prompt"}',
    );
  });

  it("imports and exports only 32-byte root keys", () => {
    expect(decodeRootKey(encodeRootKey(rootKey))).toEqual(rootKey);
    expect(() => decodeRootKey("c2hvcnQ=")).toThrow(
      "E2EE root key must be 32 bytes",
    );
  });

  it("generates a random 32-byte root key in the browser", () => {
    const first = generateEncodedRootKey();
    const second = generateEncodedRootKey();

    expect(decodeRootKey(first)).toHaveLength(32);
    expect(decodeRootKey(second)).toHaveLength(32);
    expect(second).not.toBe(first);
  });
});
