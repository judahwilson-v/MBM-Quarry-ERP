"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate, formatQty } from "@/lib/utils";

export function InventoryPage() {
  const [stockRows, setStockRows] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [form, setForm] = useState({ materialId: "", qty: "", notes: "" });
  const [message, setMessage] = useState("");

  async function load() {
    const [stock, history] = await Promise.all([
      fetch("/api/v1/inventory/stock").then((response) => response.json()),
      fetch("/api/v1/inventory?pageSize=100").then((response) => response.json()),
    ]);
    setStockRows(stock.data ?? []);
    setMovements(history.data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit() {
    const response = await fetch("/api/v1/inventory/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Save failed.");
      return;
    }
    setMessage("Production movement saved.");
    setForm({ materialId: "", qty: "", notes: "" });
    await load();
  }

  const materialOptions = stockRows.map((row) => ({ value: row.material.id, label: row.material.name, description: row.material.code }));
  const alerts = stockRows.filter((row) => row.status !== "OK");

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Inventory Management</h1>
        <p className="text-sm text-muted-foreground">Stock dashboard, alerts, production entry, and movement history.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stockRows.map((row) => (
          <Card key={row.material.id}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{row.material.code}</div>
                  <div className="text-lg font-semibold">{row.material.name}</div>
                </div>
                <Badge variant={row.status === "OK" ? "success" : row.status === "Low" ? "warning" : "destructive"}>{row.status}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Metric label="Opening" value={formatQty(row.opening)} />
                <Metric label="Production" value={formatQty(row.production)} />
                <Metric label="Dispatched" value={formatQty(row.dispatched)} />
                <Metric label="Current" value={formatQty(row.currentStock)} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {alerts.length ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {alerts.map((row) => (
              <div key={row.material.id} className="flex justify-between rounded-md border border-destructive/30 p-3 text-sm">
                <span>{row.material.name}</span>
                <span>{formatQty(row.currentStock)} / Reorder {formatQty(row.material.reorderLevel)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Production Entry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_160px_1fr_auto]">
          <Field label="Material">
            <SearchableSelect value={form.materialId} options={materialOptions} placeholder="Select material" onChange={(value) => setForm((f) => ({ ...f, materialId: value }))} />
          </Field>
          <Field label="Qty">
            <Input className="text-right" type="number" value={form.qty} onChange={(event) => setForm((f) => ({ ...f, qty: event.target.value }))} />
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))} />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void submit()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          {message ? <p className="md:col-span-4 text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Movement History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                  <TableCell>{row.material?.name}</TableCell>
                  <TableCell>{row.type}</TableCell>
                  <TableCell className="number-cell">{formatQty(row.qty)}</TableCell>
                  <TableCell>{row.refId ?? "-"}</TableCell>
                  <TableCell>{row.notes ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium tabular-nums">{value}</div>
    </div>
  );
}
