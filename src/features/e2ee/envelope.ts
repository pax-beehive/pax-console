const PROTOCOL_VERSION = 1;
const CIPHER_VERSION = 1;
const ROOT_KEY_BYTES = 32;
const NONCE_BYTES = 12;

export type E2EEDirection = "command" | "event";

export type EncryptedEnvelope = {
  protocol_version: 1;
  cipher_version: 1;
  key_epoch: number;
  record_id: string;
  agent_id: string;
  session_id: string;
  kind: string;
  nonce: string;
  payload: string;
};

export type EnvelopeMetadata = Pick<
  EncryptedEnvelope,
  "agent_id" | "key_epoch" | "kind" | "record_id" | "session_id"
>;

export async function encryptEnvelope(
  rootKey: Uint8Array,
  direction: E2EEDirection,
  metadata: EnvelopeMetadata,
  plaintext: Uint8Array,
): Promise<EncryptedEnvelope> {
  validateRootKey(rootKey);
  validateMetadata(metadata);

  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return sealEnvelope(rootKey, direction, metadata, plaintext, nonce);
}

export async function decryptEnvelope(
  rootKey: Uint8Array,
  direction: E2EEDirection,
  envelope: EncryptedEnvelope,
): Promise<Uint8Array> {
  validateRootKey(rootKey);
  validateEnvelope(envelope);

  const nonce = decodeBase64(envelope.nonce);
  if (nonce.byteLength !== NONCE_BYTES) {
    throw new Error("E2EE nonce must be 12 bytes");
  }
  const ciphertext = decodeBase64(envelope.payload);
  const key = await deriveKey(rootKey, direction, envelope);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad(envelope)),
      tagLength: 128,
    },
    key,
    toArrayBuffer(ciphertext),
  );
  return new Uint8Array(plaintext);
}

export function encodeRootKey(rootKey: Uint8Array) {
  validateRootKey(rootKey);
  return encodeBase64(rootKey);
}

export function generateEncodedRootKey() {
  return encodeRootKey(crypto.getRandomValues(new Uint8Array(ROOT_KEY_BYTES)));
}

export function decodeRootKey(encoded: string) {
  const rootKey = decodeBase64(encoded.trim());
  validateRootKey(rootKey);
  return rootKey;
}

async function sealEnvelope(
  rootKey: Uint8Array,
  direction: E2EEDirection,
  metadata: EnvelopeMetadata,
  plaintext: Uint8Array,
  nonce: Uint8Array,
): Promise<EncryptedEnvelope> {
  const envelope: EncryptedEnvelope = {
    protocol_version: PROTOCOL_VERSION,
    cipher_version: CIPHER_VERSION,
    ...metadata,
    nonce: encodeBase64(nonce),
    payload: "",
  };
  const key = await deriveKey(rootKey, direction, metadata);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(nonce),
      additionalData: toArrayBuffer(aad(envelope)),
      tagLength: 128,
    },
    key,
    toArrayBuffer(plaintext),
  );
  envelope.payload = encodeBase64(new Uint8Array(ciphertext));
  return envelope;
}

async function deriveKey(
  rootKey: Uint8Array,
  direction: E2EEDirection,
  metadata: EnvelopeMetadata,
) {
  const imported = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rootKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: keyInfo(direction, metadata),
    },
    imported,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function keyInfo(direction: E2EEDirection, metadata: EnvelopeMetadata) {
  return new TextEncoder().encode(
    `pax/e2ee/v1/${direction}\0${metadata.agent_id}\0${metadata.session_id}\0${metadata.key_epoch}`,
  );
}

function aad(metadata: EnvelopeMetadata | EncryptedEnvelope) {
  return new TextEncoder().encode(
    JSON.stringify([
      PROTOCOL_VERSION,
      CIPHER_VERSION,
      String(metadata.key_epoch),
      metadata.record_id,
      metadata.agent_id,
      metadata.session_id,
      metadata.kind,
    ]),
  );
}

function validateEnvelope(envelope: EncryptedEnvelope) {
  if (envelope.protocol_version !== PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported E2EE protocol version: ${envelope.protocol_version}`,
    );
  }
  if (envelope.cipher_version !== CIPHER_VERSION) {
    throw new Error(
      `Unsupported E2EE cipher version: ${envelope.cipher_version}`,
    );
  }
  validateMetadata(envelope);
}

function validateMetadata(metadata: EnvelopeMetadata) {
  if (!Number.isSafeInteger(metadata.key_epoch) || metadata.key_epoch < 1) {
    throw new Error("E2EE key epoch must be a positive safe integer");
  }
  for (const [name, value] of Object.entries({
    record_id: metadata.record_id,
    agent_id: metadata.agent_id,
    session_id: metadata.session_id,
    kind: metadata.kind,
  })) {
    if (!value || value.includes("\0")) {
      throw new Error(`E2EE ${name} must be non-empty and cannot contain NUL`);
    }
  }
}

function validateRootKey(rootKey: Uint8Array) {
  if (rootKey.byteLength !== ROOT_KEY_BYTES) {
    throw new Error("E2EE root key must be 32 bytes");
  }
}

function encodeBase64(value: Uint8Array) {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function decodeBase64(value: string) {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error("Invalid E2EE base64 value");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}
