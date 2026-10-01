export const ROOT_KEY_STORE = "root-keys";
export const DEVICE_KEY_STORE = "device-key";
export const PENDING_PAIRING_STORE = "pending-pairings";

const DATABASE_NAME = "pax-console-e2ee";
export const SHORT_PAIRING_STORE = "short-pairing-state";
const DATABASE_VERSION = 3;

export function openE2EEDatabase() {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const [name, keyPath] of [
        [ROOT_KEY_STORE, "agentId"],
        [DEVICE_KEY_STORE, "id"],
        [PENDING_PAIRING_STORE, "pairingId"],
        [SHORT_PAIRING_STORE, "id"],
      ] as const) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Open E2EE key store failed"));
  });
}

export function e2eeRequestResult<T = IDBValidKey>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("E2EE key store request failed"));
  });
}
