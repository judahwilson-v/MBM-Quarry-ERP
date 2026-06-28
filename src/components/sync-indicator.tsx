"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw, AlertCircle } from "lucide-react";
import { fetchSyncStatus, triggerSync } from "@/app/actions/sync";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

export function SyncIndicator() {
  const [status, setStatus] = useState<any>({ status: "IDLE", lastSyncedAt: null, pendingCount: 0 });
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const checkStatus = async () => {
    try {
      const data = await fetchSyncStatus();
      setStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setIsOnline(navigator.onLine);
    
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Poll every 30s

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleForceSync = async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      await triggerSync();
      await checkStatus();
    } catch (err) {
      console.error("Force sync failed:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const getStatusDisplay = () => {
    if (!isOnline) {
      return { icon: <CloudOff className="w-4 h-4 text-rose-500" />, text: "Offline", color: "text-rose-500" };
    }
    if (isSyncing || status.status === "SYNCING") {
      return { icon: <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />, text: "Syncing...", color: "text-blue-500" };
    }
    if (status.status === "ERROR") {
      return { icon: <AlertCircle className="w-4 h-4 text-rose-500" />, text: "Sync Error", color: "text-rose-500" };
    }
    if (status.pendingCount > 0) {
      return { icon: <Cloud className="w-4 h-4 text-[#f39c12]" />, text: `${status.pendingCount} pending`, color: "text-[#f39c12]" };
    }
    return { icon: <Cloud className="w-4 h-4 text-emerald-500" />, text: "Synced", color: "text-emerald-500" };
  };

  const display = getStatusDisplay();

  return (
    <div className="flex items-center gap-3 text-sm bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-800">
      <div className={`flex items-center gap-1.5 font-medium ${display.color}`}>
        {display.icon}
        <span className="hidden sm:inline-block">{display.text}</span>
      </div>
      
      <div className="hidden sm:block w-px h-4 bg-gray-300 dark:bg-gray-700 mx-1"></div>
      
      <div className="hidden sm:flex flex-col text-[10px] leading-tight text-gray-500">
        <span>Last synced:</span>
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {status.lastSyncedAt ? formatDistanceToNow(new Date(status.lastSyncedAt), { addSuffix: true }) : "Never"}
        </span>
      </div>

      {(status.pendingCount > 0 || status.status === "ERROR") && isOnline && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleForceSync}
          disabled={isSyncing || status.status === "SYNCING"}
          className="ml-1 h-6 px-2 text-xs font-medium"
        >
          Force Sync
        </Button>
      )}
    </div>
  );
}
