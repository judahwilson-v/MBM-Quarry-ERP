"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { pendingQueueCount, refreshMasterMirror, syncPendingRecords } from "@/lib/offline/sync";

type OfflineContextValue = {
  isOnline: boolean;
  pendingCount: number;
  syncMessage: string;
  isSyncing: boolean;
  refreshPendingCount: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await pendingQueueCount());
  }, []);

  const syncNow = useCallback(async () => {
    if (status !== "authenticated") return;
    if (!navigator.onLine) {
      setSyncMessage("Offline - waiting for connection");
      return;
    }
    setIsSyncing(true);
    try {
      await syncPendingRecords(setSyncMessage);
      await refreshPendingCount();
      await refreshMasterMirror();
      setSyncMessage("All synced");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }, [refreshPendingCount, status]);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    if (status !== "authenticated") {
      setPendingCount(0);
      setSyncMessage("");
      return;
    }
    refreshPendingCount();

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "SYNC_NOW") void syncNow();
      });
    }

    const handleOnline = () => {
      setIsOnline(true);
      void syncNow();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncMessage("You are offline - entries will sync when connected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void refreshMasterMirror();
    const mirrorInterval = window.setInterval(refreshMasterMirror, 15 * 60 * 1000);
    const countInterval = window.setInterval(refreshPendingCount, 5000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.clearInterval(mirrorInterval);
      window.clearInterval(countInterval);
    };
  }, [refreshPendingCount, status, syncNow]);

  const value = useMemo(
    () => ({ isOnline, pendingCount, syncMessage, isSyncing, refreshPendingCount, syncNow }),
    [isOnline, pendingCount, refreshPendingCount, syncMessage, isSyncing, syncNow],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline() {
  const value = useContext(OfflineContext);
  if (!value) throw new Error("useOffline must be used inside OfflineProvider");
  return value;
}
