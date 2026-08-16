"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { todayInputValue } from "@/lib/utils";
import { fetchAuditLogs, fetchAuditLogEntityNames } from "@/app/actions/audit-logs";
import { Search, RefreshCw } from "lucide-react";

type AuditLogEntry = {
  id: string;
  entityName: string;
  entityId: string;
  action: string;
  payload: string | null;
  createdAt: string;
};

const ACTION_STYLES: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  update: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

function parsePayloadSummary(payload: string | null): string {
  if (!payload) return "—";
  try {
    const parsed = JSON.parse(payload);
    if (parsed.after && typeof parsed.after === "object") {
      const keys = Object.keys(parsed.after).filter((k) => k !== "id" && k !== "createdAt" && k !== "updatedAt");
      return keys.slice(0, 4).map((k) => `${k}: ${String(parsed.after[k]).substring(0, 30)}`).join(", ");
    }
    const keys = Object.keys(parsed).filter((k) => k !== "id");
    return keys.slice(0, 4).map((k) => `${k}: ${String(parsed[k]).substring(0, 30)}`).join(", ");
  } catch {
    return payload.substring(0, 80);
  }
}

export function UserLogsViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [entityNames, setEntityNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: todayInputValue(),
    dateTo: todayInputValue(),
    entityName: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsResult, namesResult] = await Promise.all([
        fetchAuditLogs({
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          entityName: filters.entityName || undefined,
        }),
        fetchAuditLogEntityNames(),
      ]);
      setLogs(logsResult);
      setEntityNames(namesResult);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <div className="space-y-6 p-4 lg:p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Logs</h1>
        <p className="text-muted-foreground">Audit trail of all data changes.</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <Field label="From" error="">
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </Field>
            <Field label="To" error="">
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              />
            </Field>
            <Field label="Entity" error="">
              <select
                className="flex h-9 w-full rounded-md border border-input px-3 py-1 text-sm shadow-sm min-w-[140px]"
                value={filters.entityName}
                onChange={(e) => setFilters({ ...filters, entityName: e.target.value })}
              >
                <option value="">All</option>
                {entityNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Button variant="outline" onClick={loadData} disabled={loading} className="mb-0.5">
              {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">Search</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Results {logs.length > 0 && <span className="text-muted-foreground font-normal">({logs.length})</span>}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading && logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading...</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No audit logs found for the selected filters.</p>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-[350px])] sm:max-h-[60vh]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-background shadow-sm print:relative print:shadow-none print:z-0">
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Time</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Action</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Entity</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">ID</th>
                    <th className="pb-2 font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("en-IN", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
                        })}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${ACTION_STYLES[log.action] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-medium">{log.entityName}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs" title={log.entityId}>
                        {log.entityId.length > 12 ? `${log.entityId.slice(0, 12)}…` : log.entityId}
                      </td>
                      <td className="py-2.5 text-muted-foreground text-xs max-w-[300px] truncate" title={log.payload || ""}>
                        {parsePayloadSummary(log.payload)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
