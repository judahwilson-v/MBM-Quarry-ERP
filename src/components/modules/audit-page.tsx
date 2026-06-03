"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";

export function AuditPage() {
  const [filters, setFilters] = useState({ table: "", recordId: "", userId: "", from: "", to: "" });
  const [rows, setRows] = useState<any[]>([]);

  async function load() {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const endpoint = filters.recordId ? `/api/v1/audit/${filters.recordId}?${params.toString()}` : `/api/v1/audit?${params.toString()}`;
    const body = await fetch(endpoint).then((response) => response.json());
    setRows(body.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Audit Trail</h1>
        <p className="text-sm text-muted-foreground">Owner and GM view of creates, updates, deletes, and field changes.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-6">
          <Field label="Table">
            <Input value={filters.table} onChange={(event) => setFilters((f) => ({ ...f, table: event.target.value }))} />
          </Field>
          <Field label="Record ID">
            <Input value={filters.recordId} onChange={(event) => setFilters((f) => ({ ...f, recordId: event.target.value }))} />
          </Field>
          <Field label="User ID">
            <Input value={filters.userId} onChange={(event) => setFilters((f) => ({ ...f, userId: event.target.value }))} />
          </Field>
          <Field label="From">
            <Input type="date" value={filters.from} onChange={(event) => setFilters((f) => ({ ...f, from: event.target.value }))} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to} onChange={(event) => setFilters((f) => ({ ...f, to: event.target.value }))} />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void load()}>Apply</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Record ID</TableHead>
                <TableHead>Change Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell>{row.user?.name ?? row.userId}</TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>{row.tableName}</TableCell>
                  <TableCell className="font-mono text-xs">{row.recordId}</TableCell>
                  <TableCell>{diffSummary(row.before, row.after)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function diffSummary(before: Record<string, any> | null, after: Record<string, any> | null) {
  if (!before && after) return "Created record";
  if (before && !after) return "Deleted record";
  if (!before || !after) return "-";
  const changes = Object.keys(after)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .slice(0, 6);
  return changes.length ? changes.join(", ") : "No field changes";
}
