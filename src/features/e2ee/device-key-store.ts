import type { PairingContext, PairingDeviceKey } from "./pairing";
import { generatePairingDeviceKey } from "./pairing";
import {
  DEVICE_KEY_STORE,
  e2eeRequestResult,
  openE2EEDatabase,
  PENDING_PAIRING_STORE,
} from "./indexed-db";

const BROWSER_DEVICE_ID = "browser-device";

type StoredDeviceKey = PairingDeviceKey & { id: string; createdAt: string };

export type PendingPairing = PairingContext & {
  privateKey: CryptoKey;
  publicKey: Uint8Array;
  secret: Uint8Array;
  createdAt: string;
  expiresAt?: string;
};

export async function loadOrCreatePairingDevice() {
  const database = await openE2EEDatabase();
  const store = database
    .transaction(DEVICE_KEY_STORE, "readonly")
    .objectStore(DEVICE_KEY_STORE);
  const stored = await e2eeRequestResult<StoredDeviceKey | undefined>(
    store.get(BROWSER_DEVICE_ID),
  );
  database.close();
  if (stored) {
    return stored satisfies PairingDeviceKey;
  }
  const generated = await generatePairingDeviceKey();
  const writeDatabase = await openE2EEDatabase();
  await e2eeRequestResult(
    writeDatabase
      .transaction(DEVICE_KEY_STORE, "readwrite")
      .objectStore(DEVICE_KEY_STORE)
      .put({
        ...generated,
        id: BROWSER_DEVICE_ID,
        createdAt: new Date().toISOString(),
      } satisfies StoredDeviceKey),
  );
  writeDatabase.close();
  return generated;
}

export async function savePendingPairing(pairing: PendingPairing) {
  const database = await openE2EEDatabase();
  await e2eeRequestResult(
    database
      .transaction(PENDING_PAIRING_STORE, "readwrite")
      .objectStore(PENDING_PAIRING_STORE)
      .put(pairing),
  );
  database.close();
}

export async function loadPendingPairing(pairingId: string) {
  const database = await openE2EEDatabase();
  const pairing = await e2eeRequestResult<PendingPairing | undefined>(
    database
      .transaction(PENDING_PAIRING_STORE, "readonly")
      .objectStore(PENDING_PAIRING_STORE)
      .get(pairingId),
  );
  database.close();
  return pairing;
}

export async function listPendingPairings(agentId: string) {
  const database = await openE2EEDatabase();
  const pairings = await e2eeRequestResult<PendingPairing[]>(
    database
      .transaction(PENDING_PAIRING_STORE, "readonly")
      .objectStore(PENDING_PAIRING_STORE)
      .getAll(),
  );
  database.close();
  return pairings.filter((pairing) => pairing.agentId === agentId);
}

export async function deletePendingPairing(pairingId: string) {
  const database = await openE2EEDatabase();
  await e2eeRequestResult(
    database
      .transaction(PENDING_PAIRING_STORE, "readwrite")
      .objectStore(PENDING_PAIRING_STORE)
      .delete(pairingId),
  );
  database.close();
}
