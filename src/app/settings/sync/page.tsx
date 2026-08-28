"use client";

import { useEffect, useState, useCallback } from "react";
import {
  fetchDetailedSyncStatus,
  forcePushSync,
  forcePullSync,
  triggerSync,
  fetchOnlineStatus,
  checkRestoreEligibility,
  performFullRestore,
  fetchRestoreDiffSummary,
  retryOutboxDelivery,
  exportSyncDiagnostics,
} from "@/app/actions/sync";
import TableDiffViewer from "@/components/sync/TableDiffViewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Cloud, CloudOff, RefreshCw, AlertCircle,
  CheckCircle2, Clock, ServerCrash,
  ArrowUpCircle, AlertTriangle, Download, ArrowLeftRight,
  Lock, FileDown, RotateCcw, Activity, Inbox
} from "lucide-react";

type SyncData = Awaited<ReturnType<typeof fetchDetailedSyncStatus>>;

/** Client-side mirror of SYNC_ERROR_USER_MESSAGES from sync-health.ts */
const ERROR_GUIDANCE: Record<string, { title: string; action: string; severity: "warning" | "error" | "info" }> = {
  NETWORK: {
    title: "Network connection failed",
    action: "Check your internet connection and try again. If the problem persists, verify the server is reachable.",
    severity: "warning",
  },
  AUTH: {
    title: "Authentication error",
    action: "The sync credentials may have expired or are invalid. Restart the application or contact your administrator.",
    severity: "error",
  },
  CONSTRAINT: {
    title: "Data conflict detected",
    action: "A duplicate or missing parent record was encountered. Use 'Retry Outbox' to reattempt delivery, or export diagnostics for support.",
    severity: "warning",
  },
  PAYLOAD: {
    title: "Invalid data format",
    action: "A record contains unsupported or malformed data. Export diagnostics and contact support for assistance.",
    severity: "error",
  },
  LEASE_BUSY: {
    title: "Sync already in progress",
    action: "Another sync operation is currently running. Please wait for it to complete before retrying.",
    severity: "info",
  },
  RESTORE_REFUSED: {
    title: "Restore blocked",
    action: "There are unsynced local changes. Push your data first, then attempt the restore again.",
    severity: "warning",
  },
  UNKNOWN: {
    title: "Unexpected error",
    action: "An unclassified error occurred. Export diagnostics and contact support for investigation.",
    severity: "error",
  },
};

function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "Never";
  const diff = Date.now() - new Date(isoString).getTime();
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export default function SyncDashboardPage() {
  const [data, setData] = useState<SyncData | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

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

  const [diffSummaries, setDiffSummaries] = useState<Awaited<ReturnType<typeof fetchRestoreDiffSummary>> | null>(null);
  const [diffPhase, setDiffPhase] = useState<'idle' | 'loading' | 'summary' | 'detailed'>('idle');
  const [selectedDiffTable, setSelectedDiffTable] = useState<string | null>(null);

  const handleCompareData = async () => {
    setDiffPhase('loading');
    try {
      const result = await fetchRestoreDiffSummary();
      setDiffSummaries(result);
      setDiffPhase('summary');
    } catch (error) {
      console.error("Failed to fetch diff summary", error);
      alert("Failed to compare data: " + error);
      setDiffPhase('idle');
    }
  };

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

  const loadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleAction = async (actionName: string, actionFn: () => Promise<any>) => {
    if (data?.overall?.currentLeaseHolder && actionName !== "refresh") {
      setActionMessage({ type: "info", text: `Sync is busy ("${data.overall.currentLeaseHolder}" running). Try again shortly.` });
      return;
    }
    setActionLoading(actionName);
    setActionMessage(null);
    try {
      const result = await actionFn();
      await loadData();
      if (result?.success === false && result?.reason) {
        setActionMessage({ type: "info", text: result.reason });
      }
    } catch (error) {
      console.error(`Action ${actionName} failed`, error);
      setActionMessage({ type: "error", text: `Action failed: ${String(error)}` });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryOutbox = () => {
    handleAction("retryOutbox", retryOutboxDelivery);
  };

  const handleExportDiagnostics = async () => {
    setActionLoading("export");
    try {
      const diagnostics = await exportSyncDiagnostics();
      const blob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sync-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionMessage({ type: "success", text: "Diagnostics exported successfully." });
    } catch (error) {
      console.error("Failed to export diagnostics", error);
      setActionMessage({ type: "error", text: `Export failed: ${String(error)}` });
    } finally {
      setActionLoading(null);
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
  const leaseHolder = data?.overall?.currentLeaseHolder;
  const isBusy = !!leaseHolder || !!actionLoading;

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Sync Dashboard</h2>
        <div className="flex items-center gap-2">
          {leaseHolder && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1.5 px-3 py-1 text-sm font-medium">
              <Lock className="h-3.5 w-3.5" />
              {leaseHolder}
            </Badge>
          )}
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

      {/* Action message banner */}
      {actionMessage && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
          actionMessage.type === "error" ? "bg-destructive/10 text-destructive border border-destructive/20" :
          actionMessage.type === "success" ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20" :
          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
        }`}>
          {actionMessage.type === "error" ? <AlertCircle className="h-4 w-4 shrink-0" /> :
           actionMessage.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> :
           <Lock className="h-4 w-4 shrink-0" />}
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="ml-auto text-current opacity-60 hover:opacity-100">×</button>
        </div>
      )}

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
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={handleCompareData} className="border-indigo-200 hover:bg-indigo-50 dark:border-indigo-800 dark:hover:bg-indigo-950" disabled={isBusy || !isOnline}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Compare Data
            </Button>
            <Button variant="outline" onClick={handleCheckRestore} className="border-indigo-200 hover:bg-indigo-50 dark:border-indigo-800 dark:hover:bg-indigo-950" disabled={isBusy || !isOnline}>
              <Download className="mr-2 h-4 w-4" />
              Restore All Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Restore Multi-Phase Dialog */}
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
                <DialogTitle>Restore from Server</DialogTitle>
                <DialogDescription>
                  {eligibilityData.totalSupabaseRows.toLocaleString()} total rows available on server
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 max-h-[50vh] overflow-auto pr-2">
                {eligibilityData.hasExistingData && (
                  <div className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 p-3 rounded-lg text-sm flex gap-2">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <div>This PC has {eligibilityData.localRecordCount.toLocaleString()} existing records. A full restore will replace all local data.</div>
                  </div>
                )}
                {eligibilityData.warnings.map((w, i) => (
                  <div key={i} className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">{w}</div>
                ))}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">Table</th>
                      <th className="text-right p-2 font-medium">Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibilityData.supabaseTables.filter(t => t.rowCount > 0).map(t => (
                      <tr key={t.table} className="border-b">
                        <td className="p-2">{t.table}</td>
                        <td className="p-2 text-right">{t.rowCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={handleCloseRestoreDialog}>Cancel</Button>
                <Button variant="default" onClick={handleConfirmRestore} disabled={!eligibilityData.eligible}>
                  Yes, Restore Everything
                </Button>
              </DialogFooter>
            </>
          )}

          {restorePhase === 'restoring' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <RefreshCw className="h-10 w-10 animate-spin text-indigo-500" />
              <div className="text-lg font-medium">Restoring data...</div>
              <p className="text-sm text-muted-foreground">Do not close this window.</p>
            </div>
          )}

          {restorePhase === 'success' && restoreResult && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-5 w-5" /> Restore Complete
                </DialogTitle>
              </DialogHeader>
              <p className="text-sm">Restored {restoreResult.tablesRestored} tables ({restoreResult.totalRows.toLocaleString()} rows).</p>
              <DialogFooter>
                <Button onClick={handleCloseRestoreDialog}>Close</Button>
              </DialogFooter>
            </>
          )}

          {restorePhase === 'error' && restoreResult && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" /> Restore Failed
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2 max-h-[40vh] overflow-auto">
                {restoreResult.errors.map((e, i) => (
                  <div key={i} className="text-sm bg-destructive/10 p-2 rounded border border-destructive/20">
                    <span className="font-semibold">{e.table}</span>: {e.error}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseRestoreDialog}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Diff Comparison Dialog */}
      <Dialog open={diffPhase !== 'idle'} onOpenChange={(open) => !open && setDiffPhase('idle')}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          {diffPhase === 'loading' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <RefreshCw className="h-10 w-10 animate-spin text-indigo-500" />
              <div className="text-lg font-medium">Comparing data...</div>
            </div>
          )}

          {diffPhase === 'summary' && diffSummaries && !selectedDiffTable && (
            <>
              <DialogHeader>
                <DialogTitle>Data Comparison: Local vs Server</DialogTitle>
              </DialogHeader>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">Table</th>
                      <th className="text-center p-3 font-medium text-destructive">Local Only</th>
                      <th className="text-center p-3 font-medium text-green-600">Server Only</th>
                      <th className="text-center p-3 font-medium text-amber-600">Modified</th>
                      <th className="text-center p-3 font-medium text-muted-foreground">Identical</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffSummaries.map(t => (
                      <tr key={t.table} className="border-t hover:bg-muted/50">
                        <td className="p-3 font-medium">{t.table}</td>
                        <td className="p-3 text-center">{t.localOnly > 0 ? <Badge variant="destructive">{t.localOnly}</Badge> : "—"}</td>
                        <td className="p-3 text-center">{t.serverOnly > 0 ? <Badge className="bg-green-500">{t.serverOnly}</Badge> : "—"}</td>
                        <td className="p-3 text-center">{t.modified > 0 ? <Badge className="bg-amber-500">{t.modified}</Badge> : "—"}</td>
                        <td className="p-3 text-center text-muted-foreground">{t.identical > 0 ? t.identical : "—"}</td>
                        <td className="p-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => setSelectedDiffTable(t.table)}>
                            View Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDiffPhase('idle')}>Close</Button>
              </DialogFooter>
            </>
          )}

          {diffPhase === 'summary' && selectedDiffTable && (
            <div className="py-2">
              <TableDiffViewer
                tableName={selectedDiffTable}
                onBack={() => setSelectedDiffTable(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Overview Metric Cards */}
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

      {/* Outbox Health Card */}
      {data?.outbox && (
        <Card className="border-blue-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Inbox className="h-5 w-5 text-blue-500" />
              Outbox Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
              <div>
                <p className="text-xs text-muted-foreground">Total Events</p>
                <p className="text-lg font-semibold">{data.outbox.total}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className={`text-lg font-semibold ${data.outbox.pending > 0 ? "text-amber-600" : ""}`}>{data.outbox.pending}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sending</p>
                <p className={`text-lg font-semibold ${data.outbox.sending > 0 ? "text-blue-600" : ""}`}>{data.outbox.sending}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Acknowledged</p>
                <p className="text-lg font-semibold text-green-600">{data.outbox.acked}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Oldest Pending</p>
                <p className="text-lg font-semibold">{formatDuration(data.outbox.oldestPendingAgeMs)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Last Delivered</p>
                <p className="text-sm font-medium">{formatRelativeTime(data.outbox.lastDeliveredAt)}</p>
              </div>
            </div>
            {(data.outbox.retryDistribution.attempts1to3 > 0 || data.outbox.retryDistribution.attempts4plus > 0) && (
              <div className="mt-3 flex gap-3 text-xs">
                <span className="text-muted-foreground">Retry distribution:</span>
                <Badge variant="outline" className="text-xs">Fresh: {data.outbox.retryDistribution.attempts0}</Badge>
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">1-3 retries: {data.outbox.retryDistribution.attempts1to3}</Badge>
                {data.outbox.retryDistribution.attempts4plus > 0 && (
                  <Badge variant="outline" className="text-xs text-destructive border-destructive/30">4+ retries: {data.outbox.retryDistribution.attempts4plus}</Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Safe Action Buttons */}
      <div className="flex flex-wrap gap-2 py-4">
        <Button
          onClick={() => handleAction("sync", triggerSync)}
          disabled={isBusy || !isOnline}
        >
          {actionLoading === "sync" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Sync Now
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleAction("push", forcePushSync)}
          disabled={isBusy || !isOnline}
        >
          {actionLoading === "push" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Push
        </Button>
        <Button
          variant="secondary"
          onClick={() => handleAction("pull", forcePullSync)}
          disabled={isBusy || !isOnline}
        >
          {actionLoading === "pull" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Pull
        </Button>

        <div className="w-px h-8 bg-border mx-1 self-center" />

        <Button
          variant="outline"
          onClick={handleRetryOutbox}
          disabled={isBusy || !isOnline}
          className="border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950"
        >
          {actionLoading === "retryOutbox" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          <RotateCcw className="mr-2 h-4 w-4" />
          Retry Outbox
        </Button>
        <Button
          variant="outline"
          onClick={handleExportDiagnostics}
          disabled={actionLoading === "export"}
        >
          {actionLoading === "export" && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          <FileDown className="mr-2 h-4 w-4" />
          Export Diagnostics
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setActionMessage(null); loadData(); }}
          disabled={isLoading}
          className="ml-auto"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Model Breakdown + Errors */}
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
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium leading-none">{model.name}</p>
                        {model.deliveryMode === "outbox" && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-blue-500/30 text-blue-600 dark:text-blue-400">outbox</Badge>
                        )}
                        {model.deliveryMode === "shadow" && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/30 text-amber-600">shadow</Badge>
                        )}
                      </div>
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
                <div className="space-y-4 max-h-[350px] overflow-auto pr-2">
                  {data.recentErrors.map((error, i) => {
                    const guidance = ERROR_GUIDANCE[error.errorCode as keyof typeof ERROR_GUIDANCE] ?? ERROR_GUIDANCE.UNKNOWN;
                    const severityStyles = guidance.severity === "error"
                      ? "bg-destructive/10 border-destructive/20"
                      : guidance.severity === "warning"
                      ? "bg-amber-500/10 border-amber-500/20"
                      : "bg-blue-500/10 border-blue-500/20";
                    const iconColor = guidance.severity === "error"
                      ? "text-destructive"
                      : guidance.severity === "warning"
                      ? "text-amber-500"
                      : "text-blue-500";
                    return (
                      <div key={i} className={`flex items-start gap-4 text-sm p-3 rounded-md border ${severityStyles}`}>
                        <ServerCrash className={`h-5 w-5 mt-0.5 shrink-0 ${iconColor}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`font-semibold ${iconColor}`}>{guidance.title}</p>
                            {error.errorCode && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${iconColor}`}>{error.errorCode}</Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground">{error.table}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{guidance.action}</p>
                          <p className="text-[11px] text-muted-foreground/70 mt-1 break-all italic">{error.error}</p>
                        </div>
                      </div>
                    );
                  })}
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
