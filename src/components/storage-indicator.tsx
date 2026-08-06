"use client";

import { useEffect, useState } from "react";
import { HardDrive, RefreshCw, Trash2, Database, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSupabaseStorageUsage, triggerSupabaseDataPurge } from "@/app/actions/admin";

interface StorageStats {
  tables: { table: string; totalSize: string; rowCount: number }[];
  totalDiskMB: number;
  limitMB: number;
  usagePercent: number;
}

export function StorageIndicator({ className }: { className?: string }) {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchUsage = async () => {
    setLoading(true);
    try {
      const res = await getSupabaseStorageUsage();
      if (res.success && res.data) {
        setStats(res.data);
      }
    } catch (e: any) {
      console.error("Failed to fetch storage stats", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
  }, []);

  const handlePurge = async () => {
    setPurging(true);
    setMessage(null);
    try {
      const res = await triggerSupabaseDataPurge();
      if (res.success && res.data) {
        const purgedDetails = Object.entries(res.data.purged)
          .map(([t, count]) => `${t}: ${count} rows`)
          .join(", ");
        setMessage(`Purged old logs successfully (${purgedDetails})`);
        fetchUsage();
      } else {
        setMessage(`Purge error: ${res.message}`);
      }
    } catch (e: any) {
      setMessage(`Purge failed: ${e.message}`);
    } finally {
      setPurging(false);
    }
  };

  const usagePercent = stats ? Math.min(stats.usagePercent, 100) : 0;
  const totalDiskMB = stats ? stats.totalDiskMB : 0;
  const limitMB = stats ? stats.limitMB : 500;

  const isWarning = usagePercent >= 70;
  const isCritical = usagePercent >= 90;

  const statusVariant = isCritical
    ? "destructive"
    : isWarning
    ? "warning"
    : "success";

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-semibold">Supabase Free Tier Storage</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant}>
            {isCritical ? (
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Critical</span>
            ) : isWarning ? (
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Warning</span>
            ) : (
              <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Healthy</span>
            )}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsage}
            disabled={loading}
            className="h-8 w-8 p-0"
            title="Refresh storage stats"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <div className="flex justify-between items-center text-sm mb-1.5">
            <span className="text-muted-foreground font-medium">Used Space</span>
            <span className="font-bold">
              {totalDiskMB.toFixed(2)} MB / {limitMB} MB ({usagePercent.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                isCritical
                  ? "bg-red-600"
                  : isWarning
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.max(usagePercent, 2)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <Database className="h-3.5 w-3.5" />
            Audit logs: 3-day retention | Financial logs: 30-day
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-xs h-7 px-2"
            >
              {expanded ? "Hide Details" : "Table Breakdown"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurge}
              disabled={purging}
              className="text-xs h-7 px-2 border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              <Trash2 className={`h-3 w-3 mr-1 ${purging ? "animate-spin" : ""}`} />
              Purge Old Logs
            </Button>
          </div>
        </div>

        {message && (
          <div className="text-xs p-2 rounded bg-muted/60 text-foreground">
            {message}
          </div>
        )}

        {expanded && stats && (
          <div className="mt-3 pt-3 border-t text-xs space-y-2 max-h-48 overflow-y-auto">
            <div className="font-semibold text-foreground flex justify-between">
              <span>Top Tables (Row Count / Est Size)</span>
              <span>Local DB keeps 100% data</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {stats.tables.slice(0, 10).map((t) => (
                <div key={t.table} className="flex justify-between items-center py-0.5 border-b border-border/40">
                  <span className="font-mono text-muted-foreground truncate">{t.table}</span>
                  <span className="font-medium text-foreground">
                    {t.rowCount} rows ({t.totalSize})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
