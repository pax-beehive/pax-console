import { decodeRootKey, encodeRootKey } from "./envelope";
import {
  e2eeRequestResult,
  openE2EEDatabase,
  ROOT_KEY_STORE,
} from "./indexed-db";

type StoredRootKey = {
  agentId: string;
  encodedKey: string;
  updatedAt: string;
};

export async function saveRootKey(agentId: string, encodedKey: string) {
  const normalizedAgentId = requireAgentId(agentId);
  const normalizedKey = encodeRootKey(decodeRootKey(encodedKey));
  const database = await openE2EEDatabase();
  await e2eeRequestResult(
    database
      .transaction(ROOT_KEY_STORE, "readwrite")
      .objectStore(ROOT_KEY_STORE)
      .put({
        agentId: normalizedAgentId,
        encodedKey: normalizedKey,
        updatedAt: new Date().toISOString(),
      } satisfies StoredRootKey),
  );
  database.close();
}

export async function loadRootKey(agentId: string) {
  const database = await openE2EEDatabase();
  const stored = await e2eeRequestResult<StoredRootKey | undefined>(
    database
      .transaction(ROOT_KEY_STORE, "readonly")
      .objectStore(ROOT_KEY_STORE)
      .get(requireAgentId(agentId)),
  );
  database.close();
  return stored ? decodeRootKey(stored.encodedKey) : undefined;
}

export async function deleteRootKey(agentId: string) {
  const database = await openE2EEDatabase();
  await e2eeRequestResult(
    database
      .transaction(ROOT_KEY_STORE, "readwrite")
      .objectStore(ROOT_KEY_STORE)
      .delete(requireAgentId(agentId)),
  );
  database.close();
}

function requireAgentId(agentId: string) {
  const normalized = agentId.trim();
  if (!normalized) {
    throw new Error("Agent ID is required for an E2EE root key");
  }
  return normalized;
}
