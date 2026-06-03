"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");
  const [isSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => undefined, []);

  const syncNow = useCallback(async () => {
    setSyncMessage(navigator.onLine ? "Connected to production database" : "Offline - entries require connection");
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setSyncMessage("Connected to production database");
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncMessage("Offline - entries require connection");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

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
