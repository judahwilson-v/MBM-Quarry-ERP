"use client";

import Dexie, { type Table } from "dexie";

export type OfflineQueueEntry = {
  id: string;
  type: "SALE";
  payload: Record<string, unknown>;
  status: "PENDING" | "SYNCED" | "FAILED";
  createdAt: string;
  syncedAt?: string;
  error?: string;
};

export type MasterMirrorEntry = {
  key: "parties" | "vehicles" | "materials" | "drivers";
  data: unknown[];
  updatedAt: string;
};

export type DraftEntry = {
  key: string;
  data: Record<string, unknown>;
  updatedAt: string;
};

class MbmOfflineDb extends Dexie {
  offlineQueue!: Table<OfflineQueueEntry, string>;
  masters!: Table<MasterMirrorEntry, string>;
  drafts!: Table<DraftEntry, string>;

  constructor() {
    super("mbm-quarry-erp");
    this.version(1).stores({
      offlineQueue: "&id,type,status,createdAt",
      masters: "&key,updatedAt",
      drafts: "&key,updatedAt",
    });
  }
}

export const offlineDb = new MbmOfflineDb();
