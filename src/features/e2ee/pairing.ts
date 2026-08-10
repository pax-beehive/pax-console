const PAIRING_SECRET_BYTES = 16;
const ROOT_KEY_BYTES = 32;
const WRAPPING_NONCE_BYTES = 12;

export type PairingContext = {
  pairingId: string;
  agentId: string;
  deviceId: string;
  keyEpoch: number;
};

export type PairingDeviceKey = {
  deviceId: string;
  privateKey: CryptoKey;
  publicKey: Uint8Array;
};

export type WrappedAgentRootKey = {
  recipient_public_key: string;
  sender_ephemeral_public_key: string;
  nonce: string;
  ciphertext: string;
};

export function createPairingSecret() {
  return crypto.getRandomValues(new Uint8Array(PAIRING_SECRET_BYTES));
}

export async function generatePairingDeviceKey(): Promise<PairingDeviceKey> {
  const generated = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const privateJWK = await crypto.subtle.exportKey("jwk", generated.privateKey);
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJWK,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", generated.publicKey),
  );
  return {
    deviceId: `device_${crypto.randomUUID()}`,
    privateKey,
    publicKey,
  };
}

export async function pairingSecretCommitment(
  secret: Uint8Array,
  context: PairingContext,
  recipientPublicKey: Uint8Array,
) {
  validatePairingInputs(secret, context, recipientPublicKey);
  return new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      concat(
        new TextEncoder().encode("pax/e2ee/pairing-commitment/v1\0"),
        secret,
        new Uint8Array([0]),
        pairingPublicContext(context, recipientPublicKey),
      ),
    ),
  );
}

export async function wrapAgentRootKey(
  rootKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  secret: Uint8Array,
  context: PairingContext,
): Promise<WrappedAgentRootKey> {
  if (rootKey.byteLength !== ROOT_KEY_BYTES) {
    throw new Error("E2EE agent root key must be 32 bytes");
  }
  validatePairingInputs(secret, context, recipientPublicKey);
  const recipient = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(recipientPublicKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ephemeral = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const senderPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeral.publicKey),
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: recipient },
      ephemeral.privateKey,
      256,
    ),
  );
  const aad = pairingPackageContext(context, recipientPublicKey, senderPublic);
  const wrappingKey = await deriveWrappingKey(shared, secret, aad);
  const nonce = crypto.getRandomValues(new Uint8Array(WRAPPING_NONCE_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(nonce),
        additionalData: toArrayBuffer(aad),
        tagLength: 128,
      },
      wrappingKey,
      toArrayBuffer(rootKey),
    ),
  );
  return {
    recipient_public_key: encodePairingValue(recipientPublicKey),
    sender_ephemeral_public_key: encodePairingValue(senderPublic),
    nonce: encodePairingValue(nonce),
    ciphertext: encodePairingValue(ciphertext),
  };
}

export async function unwrapAgentRootKey(
  recipientPrivateKey: CryptoKey,
  secret: Uint8Array,
  context: PairingContext,
  wrapped: WrappedAgentRootKey,
) {
  const recipientPublic = decodePairingValue(wrapped.recipient_public_key);
  const senderPublic = decodePairingValue(wrapped.sender_ephemeral_public_key);
  validatePairingInputs(secret, context, recipientPublic);
  const sender = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(senderPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: sender },
      recipientPrivateKey,
      256,
    ),
  );
  const aad = pairingPackageContext(context, recipientPublic, senderPublic);
  const wrappingKey = await deriveWrappingKey(shared, secret, aad);
  try {
    const rootKey = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(decodePairingValue(wrapped.nonce)),
          additionalData: toArrayBuffer(aad),
          tagLength: 128,
        },
        wrappingKey,
        toArrayBuffer(decodePairingValue(wrapped.ciphertext)),
      ),
    );
    if (rootKey.byteLength !== ROOT_KEY_BYTES) {
      throw new Error("invalid root key");
    }
    return rootKey;
  } catch {
    throw new Error("Failed to unwrap E2EE agent root key");
  }
}

async function deriveWrappingKey(
  shared: Uint8Array,
  secret: Uint8Array,
  info: Uint8Array,
) {
  const imported = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(shared),
    "HKDF",
    false,
    ["deriveKey"],
  );
  const salt = await crypto.subtle.digest("SHA-256", toArrayBuffer(secret));
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: toArrayBuffer(info) },
    imported,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function pairingPublicContext(
  context: PairingContext,
  recipientPublicKey: Uint8Array,
) {
  return new TextEncoder().encode(
    JSON.stringify([
      "pax/e2ee/pairing-public/v1",
      context.pairingId,
      context.agentId,
      context.deviceId,
      context.keyEpoch,
      encodePairingValue(recipientPublicKey),
    ]),
  );
}

function pairingPackageContext(
  context: PairingContext,
  recipientPublicKey: Uint8Array,
  senderEphemeralPublicKey: Uint8Array,
) {
  return new TextEncoder().encode(
    JSON.stringify([
      "pax/e2ee/root-package/v1",
      context.pairingId,
      context.agentId,
      context.deviceId,
      context.keyEpoch,
      encodePairingValue(recipientPublicKey),
      encodePairingValue(senderEphemeralPublicKey),
    ]),
  );
}

function validatePairingInputs(
  secret: Uint8Array,
  context: PairingContext,
  recipientPublicKey: Uint8Array,
) {
  if (secret.byteLength < PAIRING_SECRET_BYTES) {
    throw new Error("Pairing secret must be at least 16 bytes");
  }
  if (recipientPublicKey.byteLength !== 65 || recipientPublicKey[0] !== 4) {
    throw new Error("Invalid recipient P-256 public key");
  }
  for (const [name, value] of Object.entries({
    pairing_id: context.pairingId,
    agent_id: context.agentId,
    device_id: context.deviceId,
  })) {
    if (!value || value.includes("\0") || value.length > 512) {
      throw new Error(`Invalid E2EE ${name}`);
    }
  }
  if (!Number.isSafeInteger(context.keyEpoch) || context.keyEpoch < 1) {
    throw new Error("Invalid E2EE key epoch");
  }
}

function concat(...values: Uint8Array[]) {
  const result = new Uint8Array(
    values.reduce((length, value) => length + value.byteLength, 0),
  );
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.byteLength;
  }
  return result;
}

export function encodePairingValue(value: Uint8Array) {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodePairingValue(value: string) {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("Invalid E2EE pairing base64 value");
  }
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return Uint8Array.from(value).buffer;
}
