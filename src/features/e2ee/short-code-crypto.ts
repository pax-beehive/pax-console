// Both OPAQUE roles run in browsers. Registration records and setup secrets
// must never be sent to Manager; it relays only the login protocol messages.
import { decodePairingValue, encodePairingValue } from "./pairing";
import { normalizeShortCode } from "./short-code-policy";

async function implementation() {
  const opaque = await import("@serenity-kit/opaque");
  await opaque.ready;
  return opaque;
}

function identities(context: string) {
  return {
    client: `pax/approver/${context}`,
    server: `pax/recipient/${context}`,
  };
}

export type CodeRegistration = { setup: string; record: string };

export async function registerCode(
  code: string,
  context: string,
): Promise<CodeRegistration> {
  const opaque = await implementation();
  const password = normalizeShortCode(code);
  const setup = opaque.server.createSetup();
  const start = opaque.client.startRegistration({ password });
  const response = opaque.server.createRegistrationResponse({
    serverSetup: setup,
    userIdentifier: context,
    registrationRequest: start.registrationRequest,
  });
  const result = opaque.client.finishRegistration({
    password,
    clientRegistrationState: start.clientRegistrationState,
    registrationResponse: response.registrationResponse,
    identifiers: identities(context),
  });
  return { setup, record: result.registrationRecord };
}

export async function startCodeLogin(code: string) {
  const opaque = await implementation();
  const result = opaque.client.startLogin({
    password: normalizeShortCode(code),
  });
  return { state: result.clientLoginState, message: result.startLoginRequest };
}

export async function answerCodeLogin(
  registration: CodeRegistration,
  message: string,
  context: string,
) {
  const opaque = await implementation();
  const result = opaque.server.startLogin({
    serverSetup: registration.setup,
    registrationRecord: registration.record,
    startLoginRequest: message,
    userIdentifier: context,
    identifiers: identities(context),
  });
  return { state: result.serverLoginState, message: result.loginResponse };
}

export async function finishCodeLogin(
  state: string,
  message: string,
  code: string,
  context: string,
) {
  const opaque = await implementation();
  const result = opaque.client.finishLogin({
    clientLoginState: state,
    loginResponse: message,
    password: normalizeShortCode(code),
    identifiers: identities(context),
  });
  return result
    ? { key: result.sessionKey, message: result.finishLoginRequest }
    : undefined;
}

export async function finishCodeAnswer(state: string, message: string) {
  const opaque = await implementation();
  return opaque.server.finishLogin({
    serverLoginState: state,
    finishLoginRequest: message,
  }).sessionKey;
}

async function channelKey(sessionKey: string, context: string) {
  const bytes = new Uint8Array(
    decodePairingValue(sessionKey.replace(/-/g, "+").replace(/_/g, "/")),
  );
  if (bytes.byteLength !== 64) throw new Error("Invalid PAKE session key");
  const material = await crypto.subtle.importKey("raw", bytes, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(`pax/short-code/channel/v2\0${context}`),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealPairingSecret(
  sessionKey: string,
  secret: string,
  context: string,
) {
  const key = await channelKey(sessionKey, context);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: nonce,
      additionalData: new TextEncoder().encode(context),
    },
    key,
    new TextEncoder().encode(secret),
  );
  return {
    nonce: encodePairingValue(nonce),
    ciphertext: encodePairingValue(new Uint8Array(ciphertext)),
  };
}

export async function openPairingSecret(
  sessionKey: string,
  payload: { nonce: string; ciphertext: string },
  context: string,
) {
  const key = await channelKey(sessionKey, context);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(decodePairingValue(payload.nonce)),
      additionalData: new TextEncoder().encode(context),
    },
    key,
    new Uint8Array(decodePairingValue(payload.ciphertext)),
  );
  return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}

export async function deriveShortCode(
  seed: string,
  pairingId: string,
  generation: number,
) {
  if (!Number.isSafeInteger(generation) || generation < 0 || generation > 9)
    throw new Error("Invalid code generation");
  const bytes = new Uint8Array(decodePairingValue(seed));
  if (bytes.length !== 32) throw new Error("Invalid short-code seed");
  const key = await crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  for (let retry = 0; retry < 128; retry++) {
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(
        JSON.stringify([
          "pax/short-code/number/v2",
          pairingId,
          generation,
          retry,
        ]),
      ),
    );
    const integer = new DataView(digest).getUint32(0);
    if (integer < 4_200_000_000)
      return String(integer % 100_000_000).padStart(8, "0");
  }
  throw new Error("Could not derive pairing code");
}
