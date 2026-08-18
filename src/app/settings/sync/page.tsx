"use client";

import { useEffect, useState } from "react";
import { 
  fetchDetailedSyncStatus, 
  forcePushSync, 
  forcePullSync, 
  triggerSync, 
  resetSyncCursor,
  fetchOnlineStatus,
  checkRestoreEligibility,
  performFullRestore
} from "@/app/actions/sync";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
  Cloud, CloudOff, RefreshCw, AlertCircle, 
  CheckCircle2, Clock, ServerCrash, 
  ArrowUpCircle, AlertTriangle, Download
} from "lucide-react";

type SyncData = Awaited<ReturnType<typeof fetchDetailedSyncStatus>>;

export default function SyncDashboardPage() {
  const [data, setData] = useState<SyncData | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  type RestorePhase = 'idle' | 'checking' | 'preview' | 'restoring' | 'success' | 'error';
  const [restorePhase, setRestorePhase] = useState<RestorePhase>('idle');
  const [eligibilityData, setEligibilityData] = useState<Awaited<ReturnType<typeof checkRestoreEligibility>> | null>(null);
  const [restoreResult, setRestoreResult] = useState<{
    success: boolean;
    tablesRestored: number;
    totalRows: number;
    errors: Array<{ table: string; rowId?: string; error: string }>;
    errorMessage?: string;
  } | null>(null);

  const handleCheckRestore = async () => {
    setRestorePhase('checking');
    try {
      const result = await checkRestoreEligibility();
      setEligibilityData(result);
      setRestorePhase('preview');
    } catch (error) {
      console.error("Failed to check restore eligibility", error);
      setRestoreResult({ success: false, tablesRestored: 0, totalRows: 0, errors: [{ table: 'global', error: String(error) }] });
      setRestorePhase('error');
    }
  };

  const handleConfirmRestore = async () => {
    if (!eligibilityData) return;
    setRestorePhase('restoring');
    try {
      const result = await performFullRestore({ force: eligibilityData.hasExistingData });
      setRestoreResult(result);
      if (result.success) {
        setRestorePhase('success');
      } else {
        setRestorePhase('error');
      }
    } catch (error) {
      console.error("Restore failed", error);
      setRestoreResult({ success: false, tablesRestored: 0, totalRows: 0, errors: [{ table: 'global', error: String(error) }] });
      setRestorePhase('error');
    }
  };

  const handleCloseRestoreDialog = () => {
    if (restorePhase === 'restoring') return;
    setRestorePhase('idle');
    setEligibilityData(null);
    setRestoreResult(null);
    if (restorePhase === 'success') {
      loadData();
    }
  };

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

      {/* Restore Section */}
      <Card className="border-indigo-500/20 shadow-sm mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Download className="h-5 w-5 text-indigo-500" />
            Restore from Server
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Download all data from the cloud server to this PC. Use this when setting up the software on a new computer.
          </p>
          <Button variant="outline" onClick={handleCheckRestore} className="shrink-0 border-indigo-200 hover:bg-indigo-50 dark:border-indigo-800 dark:hover:bg-indigo-950">
            <Download className="mr-2 h-4 w-4" />
            Restore All Data
          </Button>
        </CardContent>
      </Card>

      <Dialog open={restorePhase !== 'idle'} onOpenChange={(open) => !open && handleCloseRestoreDialog()}>
        <DialogContent className="max-w-2xl" onPointerDownOutside={(e) => restorePhase === 'restoring' && e.preventDefault()} onEscapeKeyDown={(e) => restorePhase === 'restoring' && e.preventDefault()}>
          {restorePhase === 'checking' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <RefreshCw className="h-10 w-10 animate-spin text-indigo-500" />
              <div className="text-lg font-medium">Checking server data...</div>
            </div>
          )}

          {restorePhase === 'preview' && eligibilityData && (
            <>
              <DialogHeader>
                <DialogTitle>Restore Data Preview</DialogTitle>
                <DialogDescription>
                  Review the data available on the server before proceeding.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex justify-between items-center bg-muted/50 p-3 rounded-lg">
                  <span className="font-medium">Total Server Rows</span>
                  <Badge variant="secondary" className="text-base">{eligibilityData.totalSupabaseRows}</Badge>
                </div>
                
                {eligibilityData.hasExistingData && (
                  <div className="flex items-start gap-3 bg-destructive/10 text-destructive p-3 rounded-lg border border-destructive/20">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div className="text-sm font-medium">
                      This will overwrite {eligibilityData.localRecordCount} existing local records.
                    </div>
                  </div>
                )}

                {eligibilityData.warnings.length > 0 && (
                  <div className="space-y-2">
                    {eligibilityData.warnings.map((w, i) => (
                      <div key={i} className="text-sm text-amber-600 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        {w}
                      </div>
                    ))}
                  </div>
                )}

                <div className="border rounded-md max-h-[200px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">Table</th>
                        <th className="text-right p-2 font-medium">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eligibilityData.supabaseTables.map(t => (
                        <tr key={t.table} className="border-t">
                          <td className="p-2">{t.table}</td>
                          <td className="p-2 text-right">{t.rowCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseRestoreDialog}>Cancel</Button>
                <Button variant={eligibilityData.hasExistingData ? "destructive" : "default"} onClick={handleConfirmRestore}>
                  Yes, Restore Everything
                </Button>
              </DialogFooter>
            </>
          )}

          {restorePhase === 'restoring' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <RefreshCw className="h-10 w-10 animate-spin text-indigo-500" />
              <div className="text-lg font-medium">Restoring data...</div>
              <div className="text-sm text-muted-foreground">Please do not close the application.</div>
            </div>
          )}

          {restorePhase === 'success' && restoreResult && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-6 w-6" />
                  Restore Complete!
                </DialogTitle>
              </DialogHeader>
              <div className="py-6 flex flex-col items-center text-center space-y-2">
                <p className="text-lg">{restoreResult.tablesRestored} tables restored successfully.</p>
                <p className="text-muted-foreground">{restoreResult.totalRows} total rows downloaded.</p>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseRestoreDialog}>Done</Button>
              </DialogFooter>
            </>
          )}

          {restorePhase === 'error' && restoreResult && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-6 w-6" />
                  Restore Failed
                </DialogTitle>
              </DialogHeader>
              <div className="py-4 space-y-4">
                <p className="text-sm">{restoreResult.errors.length > 0 ? restoreResult.errors.map(e => `${e.table}: ${e.error}`).join('; ') : "An unknown error occurred."}</p>
                {restoreResult.errors && restoreResult.errors.length > 0 && (
                  <div className="border rounded-md max-h-[200px] overflow-auto bg-destructive/5 p-2">
                    {restoreResult.errors.map((e, i) => (
                      <div key={i} className="text-sm text-destructive mb-2 pb-2 border-b border-destructive/10 last:mb-0 last:pb-0 last:border-0">
                        <span className="font-semibold">{e.table}</span>
                        {e.rowId && <span className="text-xs ml-2 opacity-80">(ID: {e.rowId})</span>}
                        <div className="mt-1 text-xs opacity-90">{e.error}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseRestoreDialog}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
