import { decodeRootKey, encodeRootKey } from "./envelope";

const DATABASE_NAME = "pax-console-e2ee";
const STORE_NAME = "root-keys";
const DATABASE_VERSION = 1;

type StoredRootKey = {
  agentId: string;
  encodedKey: string;
  updatedAt: string;
};

export async function saveRootKey(agentId: string, encodedKey: string) {
  const normalizedAgentId = requireAgentId(agentId);
  const normalizedKey = encodeRootKey(decodeRootKey(encodedKey));
  const database = await openDatabase();
  await requestResult(
    database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put({
        agentId: normalizedAgentId,
        encodedKey: normalizedKey,
        updatedAt: new Date().toISOString(),
      } satisfies StoredRootKey),
  );
  database.close();
}

export async function loadRootKey(agentId: string) {
  const database = await openDatabase();
  const stored = await requestResult<StoredRootKey | undefined>(
    database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(requireAgentId(agentId)),
  );
  database.close();
  return stored ? decodeRootKey(stored.encodedKey) : undefined;
}

export async function deleteRootKey(agentId: string) {
  const database = await openDatabase();
  await requestResult(
    database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .delete(requireAgentId(agentId)),
  );
  database.close();
}

function openDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "agentId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Open E2EE key store failed"));
  });
}

function requestResult<T = IDBValidKey>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("E2EE key store request failed"));
  });
}

function requireAgentId(agentId: string) {
  const normalized = agentId.trim();
  if (!normalized) {
    throw new Error("Agent ID is required for an E2EE root key");
  }
  return normalized;
}
