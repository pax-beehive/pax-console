import { apiFetch, userPath } from "@/features/api/client";
import { encodeRootKey } from "./envelope";
import {
  createPairingSecret,
  decodePairingValue,
  encodePairingValue,
  pairingSecretCommitment,
  unwrapAgentRootKey,
  wrapAgentRootKey,
  type PairingContext,
  type WrappedAgentRootKey,
} from "./pairing";
import {
  deletePendingPairing,
  listPendingPairings,
  loadOrCreatePairingDevice,
  loadPendingPairing,
  savePendingPairing,
  type PendingPairing,
} from "./device-key-store";
import { loadRootKey, saveRootKey } from "./root-key-store";

export type E2EEPairingRequest = {
  pairing_id: string;
  node_id: string;
  agent_id: string;
  device_id: string;
  device_name: string;
  key_epoch: number;
  recipient_public_key: string;
  secret_commitment: string;
  created_at: string;
  expires_at: string;
  completed_at?: string;
};

export type E2EEKeyPackage = WrappedAgentRootKey & {
  pairing_id: string;
  node_id: string;
  agent_id: string;
  device_id: string;
  key_epoch: number;
  created_at: string;
};

type CreatePairingInput = Pick<
  E2EEPairingRequest,
  | "pairing_id"
  | "device_id"
  | "device_name"
  | "key_epoch"
  | "recipient_public_key"
  | "secret_commitment"
>;

export type BrowserPairingInstructions = {
  pairingId: string;
  pairingSecret: string;
  localCommand: string;
};

export async function createE2EEPairingRequest(
  userId: string,
  agentId: string,
  input: CreatePairingInput,
) {
  return apiFetch<E2EEPairingRequest>(pairingPath(userId, agentId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listE2EEPairingRequests(userId: string, agentId: string) {
  return apiFetch<E2EEPairingRequest[]>(pairingPath(userId, agentId));
}

export async function completeE2EEPairingRequest(
  userId: string,
  agentId: string,
  pairingId: string,
  wrapped: WrappedAgentRootKey,
) {
  return apiFetch<E2EEKeyPackage>(
    `${pairingPath(userId, agentId)}/${encodeURIComponent(pairingId)}/package`,
    {
      method: "POST",
      body: JSON.stringify({
        sender_ephemeral_public_key: wrapped.sender_ephemeral_public_key,
        nonce: wrapped.nonce,
        ciphertext: wrapped.ciphertext,
      }),
    },
  );
}

export async function getE2EEKeyPackage(
  userId: string,
  agentId: string,
  deviceId: string,
  keyEpoch: number,
) {
  return apiFetch<E2EEKeyPackage>(
    userPath(
      userId,
      `/agents/${encodeURIComponent(agentId)}/e2ee/key-packages/${encodeURIComponent(deviceId)}?key_epoch=${keyEpoch}`,
    ),
  );
}

export async function beginBrowserPairing(
  userId: string,
  agentId: string,
  deviceName: string,
  keyEpoch = 1,
) {
  const device = await loadOrCreatePairingDevice();
  const secret = createPairingSecret();
  const context: PairingContext = {
    pairingId: `pair_${crypto.randomUUID()}`,
    agentId,
    deviceId: device.deviceId,
    keyEpoch,
  };
  const commitment = await pairingSecretCommitment(
    secret,
    context,
    device.publicKey,
  );
  const pending: PendingPairing = {
    ...context,
    privateKey: device.privateKey,
    publicKey: device.publicKey,
    secret,
    createdAt: new Date().toISOString(),
  };
  await savePendingPairing(pending);
  let request: E2EEPairingRequest;
  try {
    request = await createE2EEPairingRequest(userId, agentId, {
      pairing_id: context.pairingId,
      device_id: context.deviceId,
      device_name: deviceName,
      key_epoch: context.keyEpoch,
      recipient_public_key: encodePairingValue(device.publicKey),
      secret_commitment: encodePairingValue(commitment),
    });
  } catch (error) {
    await deletePendingPairing(context.pairingId);
    throw error;
  }
  return {
    request,
    ...browserPairingInstructions(pending),
  };
}

export function browserPairingInstructions(
  pending: PendingPairing,
): BrowserPairingInstructions {
  const pairingSecret = encodePairingValue(pending.secret);
  return {
    pairingId: pending.pairingId,
    pairingSecret,
    localCommand: buildLocalPairingCommand(
      pending.agentId,
      pending.pairingId,
      pairingSecret,
    ),
  };
}

export async function finishBrowserPairing(
  userId: string,
  agentId: string,
  pairingId: string,
) {
  const pending = await loadPendingPairing(pairingId);
  if (!pending || pending.agentId !== agentId) {
    throw new Error("This browser has no pending device key for the pairing");
  }
  const keyPackage = await getE2EEKeyPackage(
    userId,
    agentId,
    pending.deviceId,
    pending.keyEpoch,
  );
  if (
    keyPackage.pairing_id !== pending.pairingId ||
    keyPackage.agent_id !== pending.agentId ||
    keyPackage.device_id !== pending.deviceId ||
    keyPackage.key_epoch !== pending.keyEpoch ||
    !equalBytes(
      decodePairingValue(keyPackage.recipient_public_key),
      pending.publicKey,
    )
  ) {
    throw new Error("Wrapped root key route does not match this browser");
  }
  const rootKey = await unwrapAgentRootKey(
    pending.privateKey,
    pending.secret,
    pending,
    keyPackage,
  );
  await saveRootKey(agentId, encodeRootKey(rootKey));
  await deletePendingPairing(pairingId);
  return rootKey;
}

export async function approveBrowserPairing(
  userId: string,
  request: E2EEPairingRequest,
  encodedSecret: string,
) {
  const rootKey = await loadRootKey(request.agent_id);
  if (!rootKey) {
    throw new Error("This browser does not hold the agent root key");
  }
  const secret = decodePairingValue(encodedSecret.trim());
  const recipientPublicKey = decodePairingValue(request.recipient_public_key);
  const context = pairingContext(request);
  const commitment = await pairingSecretCommitment(
    secret,
    context,
    recipientPublicKey,
  );
  if (!equalBytes(commitment, decodePairingValue(request.secret_commitment))) {
    throw new Error("Pairing secret does not match the new browser request");
  }
  const wrapped = await wrapAgentRootKey(
    rootKey,
    recipientPublicKey,
    secret,
    context,
  );
  return completeE2EEPairingRequest(
    userId,
    request.agent_id,
    request.pairing_id,
    wrapped,
  );
}

export { listPendingPairings };

function pairingPath(userId: string, agentId: string) {
  return userPath(
    userId,
    `/agents/${encodeURIComponent(agentId)}/e2ee/pairings`,
  );
}

function pairingContext(request: E2EEPairingRequest): PairingContext {
  return {
    pairingId: request.pairing_id,
    agentId: request.agent_id,
    deviceId: request.device_id,
    keyEpoch: request.key_epoch,
  };
}

function buildLocalPairingCommand(
  agentId: string,
  pairingId: string,
  pairingSecret: string,
) {
  const body = JSON.stringify({
    agent_id: agentId,
    pairing_secret: pairingSecret,
  });
  return `curl --unix-socket "$HOME/.paxd/paxd.sock" -X POST 'http://paxd/v1/e2ee/pairings/${pairingId}/complete' -H 'Content-Type: application/json' --data '${body}'`;
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
