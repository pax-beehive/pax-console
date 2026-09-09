// Sealed-box style envelope for the "temporary secret channel" (see
// paxd/internal/secretchannel and pax_secret_channel_plan.md). This is
// deliberately independent from src/features/e2ee/*: there is no pairing
// session, no device registry, no key epoch. paxd hands out a fresh,
// single-use public key per channel; the browser encrypts once against it
// here, and pax-manager only ever relays the resulting ciphertext.
//
// The wire format must match paxd/internal/secretchannel/crypto.go
// byte-for-byte: ECDH(P-256) + HKDF-SHA256 (zero salt) + AES-256-GCM, with
// additional data binding protocol version, purpose, node_id, channel_id,
// command_id, and the channel's expiry. Changing any label or encoding here
// without updating crypto.go (or vice versa) breaks decryption silently
// (AES-GCM just fails to authenticate).

const PROTOCOL_VERSION = 1;
const PURPOSE_LABEL = "pax/secret-channel/temporary-file/v1";
const HKDF_INFO_LABEL = "pax/secret-channel/hkdf/v1";
const HKDF_SALT_BYTES = 32;
const NONCE_BYTES = 12;

export type SecretChannelContext = {
  nodeId: string;
  channelId: string;
  commandId: string;
  expiresAtUnix: number;
};

export type SealedSecret = {
  sender_public_key: string;
  nonce: string;
  ciphertext: string;
};

export async function sealSecretForChannel(
  recipientPublicKeyBase64: string,
  plaintext: string,
  context: SecretChannelContext,
): Promise<SealedSecret> {
  const recipientPublicKey = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(decodeBase64(recipientPublicKeyBase64)),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ephemeral = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const senderPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey),
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: recipientPublicKey },
      ephemeral.privateKey,
      256,
    ),
  );
  const key = await deriveSealingKey(shared);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  const aad = encodeAdditionalData(context);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(aad),
        tagLength: 128,
      },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return {
    sender_public_key: encodeBase64(senderPublicKey),
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(ciphertext),
  };
}

async function deriveSealingKey(shared: Uint8Array): Promise<CryptoKey> {
  const imported = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(shared),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(HKDF_SALT_BYTES),
      info: new TextEncoder().encode(HKDF_INFO_LABEL),
    },
    imported,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

function encodeAdditionalData(context: SecretChannelContext): Uint8Array {
  const json = JSON.stringify([
    PROTOCOL_VERSION,
    PURPOSE_LABEL,
    context.nodeId,
    context.channelId,
    context.commandId,
    context.expiresAtUnix,
  ]);
  return new TextEncoder().encode(json);
}

// expiresAtToUnixSeconds must agree with Go's time.Time.Unix(): both
// truncate to whole seconds, and the RFC3339 string paxd returns has no
// fractional seconds, so this round-trip is exact.
export function expiresAtToUnixSeconds(expiresAtIso: string): number {
  return Math.floor(new Date(expiresAtIso).getTime() / 1000);
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

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}
