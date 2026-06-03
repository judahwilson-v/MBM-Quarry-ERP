"use client";

import { useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOffline } from "@/components/offline-provider";
import { offlineDb, type OfflineQueueEntry } from "@/lib/offline/db";
import { formatDateTime } from "@/lib/utils";

export function SyncSettingsPage() {
  const [rows, setRows] = useState<OfflineQueueEntry[]>([]);
  const { syncNow, refreshPendingCount } = useOffline();

  async function load() {
    setRows(await offlineDb.offlineQueue.orderBy("createdAt").reverse().toArray());
    await refreshPendingCount();
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(load, 3000);
    return () => window.clearInterval(timer);
  }, []);

  async function retry(id: string) {
    await offlineDb.offlineQueue.update(id, { status: "PENDING", error: undefined });
    await syncNow();
    await load();
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Sync Queue</h1>
          <p className="text-sm text-muted-foreground">Offline entries, sync status, failed reasons, and retries.</p>
        </div>
        <Button onClick={() => void syncNow().then(load)}>
          <RefreshCcw className="h-4 w-4" />
          Sync Now
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Offline Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entry Type</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Error</TableHead>
                <TableHead className="text-right">Retry</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.type}</TableCell>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === "SYNCED" ? "success" : row.status === "FAILED" ? "destructive" : "warning"}>
                      {row.status === "PENDING" ? "Pending" : row.status === "SYNCED" ? "Synced" : "Failed"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-md truncate">{row.error ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" disabled={row.status === "SYNCED"} onClick={() => void retry(row.id)}>
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No offline entries yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
