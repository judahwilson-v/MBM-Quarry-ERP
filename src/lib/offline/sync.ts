"use client";

import { v4 as uuidv4 } from "uuid";
import { offlineDb, type OfflineQueueEntry } from "@/lib/offline/db";

const masterKeys = ["parties", "vehicles", "materials", "drivers"] as const;

export async function queueOfflineSale(payload: Record<string, unknown>) {
  const entry: OfflineQueueEntry = {
    id: uuidv4(),
    type: "SALE",
    payload: {
      ...payload,
      clientId: payload.clientId ?? uuidv4(),
    },
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };

  await offlineDb.offlineQueue.add(entry);
  await registerBackgroundSync();
  return entry;
}

export async function pendingQueueCount() {
  return offlineDb.offlineQueue.where("status").anyOf("PENDING", "FAILED").count();
}

export async function syncPendingRecords(onProgress?: (message: string) => void) {
  const pending = await offlineDb.offlineQueue.where("status").anyOf("PENDING", "FAILED").toArray();
  if (!pending.length) return { synced: 0, failed: 0 };

  onProgress?.(`Syncing ${pending.length} records...`);
  const response = await fetch("/api/v1/sales/bulk-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: pending }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Sync failed.");
  }

  const body = (await response.json()) as {
    results: Array<{ id: string; status: "SYNCED" | "FAILED"; error?: string }>;
  };

  let synced = 0;
  let failed = 0;
  for (const result of body.results) {
    if (result.status === "SYNCED") {
      synced += 1;
      await offlineDb.offlineQueue.update(result.id, {
        status: "SYNCED",
        syncedAt: new Date().toISOString(),
        error: undefined,
      });
    } else {
      failed += 1;
      await offlineDb.offlineQueue.update(result.id, {
        status: "FAILED",
        error: result.error ?? "Server rejected record.",
      });
    }
  }

  onProgress?.(failed ? `${synced} synced, ${failed} failed` : "All synced");
  return { synced, failed };
}

export async function refreshMasterMirror() {
  if (!navigator.onLine) return;
  for (const key of masterKeys) {
    const response = await fetch(`/api/v1/${key}?pageSize=100&includeInactive=false`);
    if (!response.ok) continue;
    const body = await response.json();
    await offlineDb.masters.put({
      key,
      data: body.data ?? [],
      updatedAt: new Date().toISOString(),
    });
  }
}

export async function getMasterMirror<T = unknown>(key: (typeof masterKeys)[number]): Promise<T[]> {
  const cached = await offlineDb.masters.get(key);
  return (cached?.data ?? []) as T[];
}

async function registerBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const syncRegistration = registration as ServiceWorkerRegistration & {
    sync?: { register(tag: string): Promise<void> };
  };
  await syncRegistration.sync?.register("mbm-sync");
}
