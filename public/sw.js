const DB_NAME = "mbm-quarry-erp";
const DB_VERSION = 1;
const QUEUE_STORE = "offlineQueue";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("sync", (event) => {
  if (event.tag === "mbm-sync") {
    event.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  const db = await openDb();
  const records = await getPending(db);
  if (!records.length) return;

  try {
    const response = await fetch("/api/v1/sales/bulk-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("Server rejected sync");
    const body = await response.json();
    await applyResults(db, body.results || []);
  } catch (error) {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({ type: "SYNC_NOW" });
    }
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPending(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, "readonly");
    const store = transaction.objectStore(QUEUE_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.filter((row) => row.status === "PENDING" || row.status === "FAILED"));
    request.onerror = () => reject(request.error);
  });
}

function applyResults(db, results) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(QUEUE_STORE, "readwrite");
    const store = transaction.objectStore(QUEUE_STORE);
    for (const result of results) {
      const getRequest = store.get(result.id);
      getRequest.onsuccess = () => {
        const row = getRequest.result;
        if (!row) return;
        row.status = result.status;
        row.error = result.error;
        row.syncedAt = result.status === "SYNCED" ? new Date().toISOString() : row.syncedAt;
        store.put(row);
      };
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
