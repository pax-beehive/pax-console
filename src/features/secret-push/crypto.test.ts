import { describe, expect, it } from "vitest";
import {
  expiresAtToUnixSeconds,
  sealSecretForChannel,
  type SecretChannelContext,
  type SealedSecret,
} from "./crypto";

// Cross-language compatibility with paxd/internal/secretchannel/crypto.go was
// verified manually during development (Node WebCrypto seal -> Go OpenSecret
// decrypt, byte-for-byte). These tests exercise the same algorithm choices
// (ECDH P-256 + HKDF-SHA256 zero-salt + AES-256-GCM) from the JS side only,
// using a test-local mirror of the Go "open" side so a regression here (wrong
// AAD, wrong HKDF label, wrong nonce length, ...) still fails loudly even
// without a live Go process in this test run.

async function generateRecipientKeyPair() {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const publicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey),
  );
  return {
    privateKey: keyPair.privateKey,
    publicKeyBase64: encodeBase64(publicKeyBytes),
  };
}

async function openSecretForChannel(
  recipientPrivateKey: CryptoKey,
  sealed: SealedSecret,
  context: SecretChannelContext,
): Promise<string> {
  const senderPublicKey = await crypto.subtle.importKey(
    "raw",
    decodeBase64(sealed.sender_public_key).buffer as ArrayBuffer,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: senderPublicKey },
    recipientPrivateKey,
    256,
  );
  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    shared,
    "HKDF",
    false,
    ["deriveKey"],
  );
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode("pax/secret-channel/hkdf/v1"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const aad = new TextEncoder().encode(
    JSON.stringify([
      1,
      "pax/secret-channel/temporary-file/v1",
      context.nodeId,
      context.channelId,
      context.commandId,
      context.expiresAtUnix,
    ]),
  );
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64(sealed.nonce).buffer as ArrayBuffer,
      additionalData: aad.buffer as ArrayBuffer,
      tagLength: 128,
    },
    aesKey,
    decodeBase64(sealed.ciphertext).buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plaintext);
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

describe("secret channel sealing", () => {
  const context: SecretChannelContext = {
    nodeId: "node_1",
    channelId: "chan_1",
    commandId: "cmd_1",
    expiresAtUnix: 1893456000,
  };

  it("round-trips a plaintext secret", async () => {
    const recipient = await generateRecipientKeyPair();
    const sealed = await sealSecretForChannel(
      recipient.publicKeyBase64,
      "sk-super-secret",
      context,
    );
    await expect(
      openSecretForChannel(recipient.privateKey, sealed, context),
    ).resolves.toBe("sk-super-secret");
  });

  it("produces a fresh ephemeral key and nonce on every call", async () => {
    const recipient = await generateRecipientKeyPair();
    const a = await sealSecretForChannel(
      recipient.publicKeyBase64,
      "value",
      context,
    );
    const b = await sealSecretForChannel(
      recipient.publicKeyBase64,
      "value",
      context,
    );
    expect(a.sender_public_key).not.toEqual(b.sender_public_key);
    expect(a.nonce).not.toEqual(b.nonce);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });

  it("fails to open with the wrong recipient", async () => {
    const recipient = await generateRecipientKeyPair();
    const other = await generateRecipientKeyPair();
    const sealed = await sealSecretForChannel(
      recipient.publicKeyBase64,
      "value",
      context,
    );
    await expect(
      openSecretForChannel(other.privateKey, sealed, context),
    ).rejects.toThrow();
  });

  it("binds ciphertext to the channel context via additional data", async () => {
    const recipient = await generateRecipientKeyPair();
    const sealed = await sealSecretForChannel(
      recipient.publicKeyBase64,
      "value",
      context,
    );
    await expect(
      openSecretForChannel(recipient.privateKey, sealed, {
        ...context,
        channelId: "chan_other",
      }),
    ).rejects.toThrow();
    await expect(
      openSecretForChannel(recipient.privateKey, sealed, {
        ...context,
        commandId: "cmd_other",
      }),
    ).rejects.toThrow();
    await expect(
      openSecretForChannel(recipient.privateKey, sealed, {
        ...context,
        expiresAtUnix: context.expiresAtUnix + 1,
      }),
    ).rejects.toThrow();
  });
});

describe("expiresAtToUnixSeconds", () => {
  it("matches Go's time.Time.Unix() for an RFC3339 (no fractional seconds) timestamp", () => {
    expect(expiresAtToUnixSeconds("2026-01-01T00:05:00Z")).toBe(1767225900);
  });
});
