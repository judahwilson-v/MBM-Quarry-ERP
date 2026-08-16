"use client";

import { useEffect, useState } from "react";
import { 
  fetchDetailedSyncStatus, 
  forcePushSync, 
  forcePullSync, 
  triggerSync, 
  resetSyncCursor,
  fetchOnlineStatus
} from "@/app/actions/sync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Cloud, CloudOff, RefreshCw, AlertCircle, 
  CheckCircle2, Clock, ServerCrash, 
  ArrowUpCircle, AlertTriangle
} from "lucide-react";

type SyncData = Awaited<ReturnType<typeof fetchDetailedSyncStatus>>;

export default function SyncDashboardPage() {
  const [data, setData] = useState<SyncData | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [online, syncData] = await Promise.all([
        fetchOnlineStatus(),
        fetchDetailedSyncStatus()
      ]);
      setIsOnline(online);
      setData(syncData);
    } catch (error) {
      console.error("Failed to load sync status", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (actionName: string, actionFn: () => Promise<any>) => {
    setActionLoading(actionName);
    try {
      await actionFn();
      await loadData();
    } catch (error) {
      console.error(`Action ${actionName} failed`, error);
      alert(`Action failed: ${String(error)}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetCursor = () => {
    if (confirm("Are you sure you want to reset the sync cursor? This will force a full re-sync and might take a while.")) {
      handleAction("reset", resetSyncCursor);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const overallStatus = data?.overall.status || "IDLE";
  
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Sync Dashboard</h2>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 gap-1.5 px-3 py-1 text-sm font-medium">
              <Cloud className="h-4 w-4" />
              Online
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5 px-3 py-1 text-sm font-medium">
              <CloudOff className="h-4 w-4" />
              Offline
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Status</CardTitle>
            {overallStatus === "SYNCING" ? (
              <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
            ) : overallStatus === "ERROR" ? (
              <AlertCircle className="h-4 w-4 text-destructive" />
            ) : overallStatus === "PARTIAL_SUCCESS" ? (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overallStatus}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Last error: {data?.overall.lastError || "None"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Push</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.overall.totalPending || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Records waiting to be sent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Push Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {data?.overall.lastPushedAt ? new Date(data.overall.lastPushedAt).toLocaleTimeString() : "Never"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.overall.lastPushedAt ? new Date(data.overall.lastPushedAt).toLocaleDateString() : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Pull Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {data?.overall.lastPulledAt ? new Date(data.overall.lastPulledAt).toLocaleTimeString() : "Never"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data?.overall.lastPulledAt ? new Date(data.overall.lastPulledAt).toLocaleDateString() : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 py-4">
        <Button 
          onClick={() => handleAction("sync", triggerSync)} 
          disabled={!!actionLoading || !isOnline}
        >
          {actionLoading === "sync" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Sync Now
        </Button>
        <Button 
          variant="secondary" 
          onClick={() => handleAction("push", forcePushSync)} 
          disabled={!!actionLoading || !isOnline}
        >
          {actionLoading === "push" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Force Push
        </Button>
        <Button 
          variant="secondary" 
          onClick={() => handleAction("pull", forcePullSync)} 
          disabled={!!actionLoading || !isOnline}
        >
          {actionLoading === "pull" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Force Pull
        </Button>
        <Button 
          variant="destructive" 
          onClick={handleResetCursor}
          disabled={!!actionLoading}
        >
          {actionLoading === "reset" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Reset Cursor
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Model Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto space-y-4 pr-2">
              {data?.models.map((model) => (
                <div key={model.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {model.status === "synced" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : model.status === "pending" ? (
                      <Clock className="h-4 w-4 text-amber-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    )}
                    <div className="space-y-1">
                      <p className="text-sm font-medium leading-none">{model.name}</p>
                      <p className="text-xs text-muted-foreground">{model.table}</p>
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {model.pendingCount} pending
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4 md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Recent Errors</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.recentErrors && data.recentErrors.length > 0 ? (
                <div className="space-y-4">
                  {data.recentErrors.map((error, i) => (
                    <div key={i} className="flex items-start gap-4 text-sm bg-destructive/10 p-3 rounded-md border border-destructive/20">
                      <ServerCrash className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="font-semibold text-destructive">{error.table}</p>
                        <p className="text-muted-foreground text-xs mt-1">{error.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-6">
                  No recent errors
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Held Logs (Missing FK)</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.heldLogs && data.heldLogs.length > 0 ? (
                <div className="space-y-4 max-h-[250px] overflow-auto pr-2">
                  {data.heldLogs.map((log, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm bg-amber-500/10 p-3 rounded-md border border-amber-500/20">
                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-amber-600 dark:text-amber-400">
                          {log.table} • {log.action}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 break-all">ID: {log.entityId}</p>
                        <p className="text-xs text-muted-foreground mt-1">{log.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground text-center py-6">
                  No held logs
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
