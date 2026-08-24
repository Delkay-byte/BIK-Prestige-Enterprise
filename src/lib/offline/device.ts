/**
 * Device enrollment — generates a stable device identifier
 * and manages local device state.
 *
 * The device ID is stored in IndexedDB and persists across
 * page reloads. It is NOT stored in localStorage (per the
 * approved offline architecture).
 */

const DEVICE_ID_KEY = "bik-device-id";

/**
 * Get or create the device identifier.
 * This is a UUID v4 stored in IndexedDB, stable across
 * page reloads but not shared between tabs.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const store = tx.objectStore("meta");
    const request = store.get(DEVICE_ID_KEY);
    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.value);
      } else {
        // Generate new device ID
        const newId = crypto.randomUUID();
        const writeTx = db.transaction("meta", "readwrite");
        writeTx.objectStore("meta").put({ key: DEVICE_ID_KEY, value: newId });
        writeTx.oncomplete = () => resolve(newId);
        writeTx.onerror = () => reject(writeTx.error);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the current device ID without creating one.
 * Returns null if no device has been enrolled.
 */
export async function getDeviceId(): Promise<string | null> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("meta", "readonly");
    const store = tx.objectStore("meta");
    const request = store.get(DEVICE_ID_KEY);
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
  });
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("bik-prestige-offline", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
