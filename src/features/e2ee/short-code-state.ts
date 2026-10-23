import { openE2EEDatabase, SHORT_PAIRING_STORE } from "./indexed-db";

export async function shortState<T>(
  id: string,
  update?: (value: T | undefined) => T,
): Promise<T | undefined> {
  const db = await openE2EEDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      SHORT_PAIRING_STORE,
      update ? "readwrite" : "readonly",
    );
    const store = tx.objectStore(SHORT_PAIRING_STORE);
    const read = store.get(id);
    let result: T | undefined;
    read.onsuccess = () => {
      try {
        result = read.result?.value as T | undefined;
        if (update) {
          result = update(result);
          store.put({ id, value: result });
        }
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Pairing state transaction failed"));
    };
  });
}

// Browser-side limits also apply if the relay is compromised. Count attempts
// before doing expensive cryptography, and persist across reload/regeneration.
export async function reserveLocalAttempt(
  userId: string,
  agentId: string,
  id: string,
) {
  await shortState<{ since: number; ids: string[] }>(
    `budget:${userId}:${agentId}`,
    (previous) => {
      const now = Date.now();
      const value =
        previous && now - previous.since < 600_000
          ? previous
          : { since: now, ids: [] };
      if (value.ids.includes(id)) return value;
      if (value.ids.length >= 30)
        throw new Error("Too many pairing attempts. Try again later.");
      return { ...value, ids: [...value.ids, id] };
    },
  );
}
