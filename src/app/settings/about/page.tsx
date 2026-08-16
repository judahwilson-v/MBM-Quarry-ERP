import { fetchSyncStatus } from "@/app/actions/sync";
import { CheckCircle2, XCircle } from "lucide-react";
import { BackupManager } from "@/components/backup-manager";
import { getSystemInfo } from "@/lib/system/system-info";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const [syncStatus, systemInfo] = await Promise.all([
    fetchSyncStatus().catch(() => null),
    getSystemInfo(),
  ]);

  const {
    appVersion,
    buildDate,
    dbSchemaVersion,
    syncEngineVersion,
    electronVersion,
    databasePath,
    isOfflineReady,
    isCloudSyncEnabled,
    isSqliteConnected,
    sqliteDetail,
    cloudDetail,
  } = systemInfo;

  return (
    <div className="flex-1 space-y-8 p-4 pt-6 md:p-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">MBM Quarry ERP</h2>
        <p className="text-muted-foreground mt-1">System Information & Database Management</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6 pb-4 border-b">
              <h3 className="tracking-tight text-lg font-semibold">System Details</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span className="font-medium">{appVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Build</span>
                <span className="font-medium">{buildDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Database Schema</span>
                <span className="font-medium">{dbSchemaVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sync Engine</span>
                <span className="font-medium">{syncEngineVersion}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Electron</span>
                <span className="font-medium">{electronVersion}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6 pb-4 border-b">
              <h3 className="tracking-tight text-lg font-semibold">Status</h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                {isOfflineReady ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                <span>Offline Ready</span>
              </div>
              <div className="flex items-center gap-2">
                {isCloudSyncEnabled ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                <div>
                  <span>Cloud Sync Enabled {syncStatus?.pendingCount ? `(${syncStatus.pendingCount} pending)` : ""}</span>
                  <p className="text-xs text-muted-foreground">{cloudDetail}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isSqliteConnected ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
                <div className="min-w-0">
                  <span className="block">SQLite Connected</span>
                  <p className="truncate text-xs text-muted-foreground" title={sqliteDetail || databasePath}>{sqliteDetail}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card text-card-foreground shadow">
            <div className="p-6 pb-4 border-b">
              <h3 className="tracking-tight text-lg font-semibold">Backup Manager</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Protect your data by creating regular backups. Restoring or importing will overwrite the current database.
              </p>
            </div>
            <div className="p-6">
              <BackupManager />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
