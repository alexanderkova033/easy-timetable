/**
 * Optional “linked” JSON backup via the File System Access API (Chromium).
 * Persists a file handle in IndexedDB; writes mirror localStorage saves.
 */

const DB_NAME = "easy-timetable-linked-file";
const DB_VER = 1;
const STORE = "kv";
const HANDLE_KEY = "backup-json-handle";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  });
}

export function supportsLinkedJsonFile() {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

export async function getLinkedJsonFileHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const q = tx.objectStore(STORE).get(HANDLE_KEY);
    q.onsuccess = () => resolve(q.result ?? null);
    q.onerror = () => reject(q.error);
  });
}

export async function setLinkedJsonFileHandle(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearLinkedJsonFileHandle() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * @param {string} text
 * @param {FileSystemFileHandle | null} [handle]
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function writeTextToLinkedJsonFile(text, handle = null) {
  const h = handle ?? (await getLinkedJsonFileHandle());
  if (!h) return { ok: false, reason: "no-handle" };
  try {
    let perm = await h.queryPermission({ mode: "readwrite" });
    if (perm !== "granted") {
      perm = await h.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") return { ok: false, reason: "permission" };
    }
    const w = await h.createWritable();
    await w.write(text);
    await w.close();
    return { ok: true };
  } catch {
    return { ok: false, reason: "io" };
  }
}

/** @param {string} [suggestedName] */
export async function pickJsonSaveFile(suggestedName = "easy-timetable-backup.json") {
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
  });
  await setLinkedJsonFileHandle(handle);
  return handle;
}
