// IndexedDB-backed queue for offline document captures.
// PRD §6.2: "write actions (uploads) queue and sync on reconnect."
// Each entry stores the file as a Blob plus minimal metadata. The
// drainer POSTs entries to /api/v1/upload (which mirrors the
// uploadFromCapture server action) and removes them on success.
//
// iOS Safari does not support Background Sync, so the canonical replay
// path is the manual drain triggered by:
//   - the `online` event in OfflineBanner
//   - the user clicking "Sync now"
//   - the initial OfflineBanner mount
// Chrome / Edge get the same manual drain, plus the SW BackgroundSync
// queue (set up in app/sw.ts) as a belt-and-braces fallback.

const DB_NAME = "numara";
const DB_VERSION = 1;
const STORE_PENDING_UPLOADS = "pending_uploads";

export type PendingUpload = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  file_blob: Blob;
  created_at: number;
  retry_count: number;
  last_error: string | null;
};

function isAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PENDING_UPLOADS)) {
        db.createObjectStore(STORE_PENDING_UPLOADS, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueUpload(file: File): Promise<PendingUpload> {
  if (!isAvailable()) {
    throw new Error("This browser does not support offline queueing.");
  }
  const entry: PendingUpload = {
    id: crypto.randomUUID(),
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    file_blob: file,
    created_at: Date.now(),
    retry_count: 0,
    last_error: null,
  };
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING_UPLOADS, "readwrite");
  tx.objectStore(STORE_PENDING_UPLOADS).put(entry);
  await txDone(tx);
  db.close();
  fireQueueChanged();
  return entry;
}

export async function listPendingUploads(): Promise<PendingUpload[]> {
  if (!isAvailable()) return [];
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING_UPLOADS, "readonly");
  const all = (await reqDone(tx.objectStore(STORE_PENDING_UPLOADS).getAll())) as PendingUpload[];
  await txDone(tx);
  db.close();
  return all.sort((a, b) => a.created_at - b.created_at);
}

export async function removePendingUpload(id: string): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING_UPLOADS, "readwrite");
  tx.objectStore(STORE_PENDING_UPLOADS).delete(id);
  await txDone(tx);
  db.close();
  fireQueueChanged();
}

async function updatePendingUpload(entry: PendingUpload): Promise<void> {
  if (!isAvailable()) return;
  const db = await openDb();
  const tx = db.transaction(STORE_PENDING_UPLOADS, "readwrite");
  tx.objectStore(STORE_PENDING_UPLOADS).put(entry);
  await txDone(tx);
  db.close();
  fireQueueChanged();
}

/**
 * Attempt to upload every pending entry. Items that succeed are
 * removed. Items that fail get retry_count incremented and last_error
 * stored. Entries with retry_count >= 5 are still retained — the user
 * is the only one who decides to drop them. Returns the count of
 * successful uploads.
 */
export async function drainPendingUploads(): Promise<{ ok: number; failed: number }> {
  if (!isAvailable()) return { ok: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { ok: 0, failed: 0 };
  }
  const items = await listPendingUploads();
  let ok = 0;
  let failed = 0;
  for (const entry of items) {
    try {
      const fd = new FormData();
      const file = new File([entry.file_blob], entry.file_name, { type: entry.mime_type });
      fd.append("file", file);
      const res = await fetch("/api/v1/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const message = await res.text().catch(() => `HTTP ${res.status}`);
        await updatePendingUpload({
          ...entry,
          retry_count: entry.retry_count + 1,
          last_error: message.slice(0, 500),
        });
        failed += 1;
        continue;
      }
      await removePendingUpload(entry.id);
      ok += 1;
    } catch (err) {
      await updatePendingUpload({
        ...entry,
        retry_count: entry.retry_count + 1,
        last_error: err instanceof Error ? err.message.slice(0, 500) : String(err),
      });
      failed += 1;
    }
  }
  return { ok, failed };
}

function fireQueueChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("numara:queue-changed"));
  }
}
