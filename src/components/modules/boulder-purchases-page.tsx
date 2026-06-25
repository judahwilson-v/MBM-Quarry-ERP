"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteIncomingBoulder, listIncomingBoulder, saveIncomingBoulder } from "@/lib/offline-actions";
import { formatDate, formatQty, todayInputValue } from "@/lib/utils";

type BoulderRow = {
  id: string;
  date: string;
  vehicleNumber: string;
  partyName: string;
  materialName: string;
  qty: number;
  remarks?: string | null;
  createdAt: string;
};

function blankForm() {
  return {
    id: "",
    date: todayInputValue(),
    vehicleNumber: "",
    partyName: "",
    qty: "",
    remarks: "",
  };
}

function dateInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function BoulderPurchasesPage() {
  const [form, setForm] = useState(() => blankForm());
  const [rows, setRows] = useState<BoulderRow[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const data = (await listIncomingBoulder(search)) as unknown as BoulderRow[];
    setRows(data);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  function edit(row: BoulderRow) {
    setForm({
      id: row.id,
      date: dateInput(row.date),
      vehicleNumber: row.vehicleNumber,
      partyName: row.partyName,
      qty: String(row.qty),
      remarks: row.remarks ?? "",
    });
    setMessage("");
    setError("");
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      await saveIncomingBoulder(form);
      setMessage(form.id ? "Boulder entry updated." : "Boulder entry saved.");
      setForm(blankForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this boulder entry?")) return;
    setError("");
    try {
      await deleteIncomingBoulder(id);
      if (form.id === id) setForm(blankForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Incoming Boulder</h1>
        <p className="text-sm text-muted-foreground">ROCK material entries stored in the local database.</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{form.id ? "Edit Boulder Entry" : "Boulder Entry"}</CardTitle>
          {form.id ? (
            <Button variant="ghost" size="icon" onClick={() => setForm(blankForm())} aria-label="Cancel edit">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </Field>
            <Field label="Vehicle Number">
              <Input value={form.vehicleNumber} onChange={(event) => setForm((current) => ({ ...current, vehicleNumber: event.target.value }))} />
            </Field>
            <Field label="Party Name">
              <Input value={form.partyName} onChange={(event) => setForm((current) => ({ ...current, partyName: event.target.value }))} />
            </Field>
            <Field label="Material">
              <Input value="ROCK" readOnly />
            </Field>
            <Field label="Qty">
              <Input
                className="text-right tabular-nums"
                type="number"
                step="0.001"
                value={form.qty}
                onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))}
              />
            </Field>
            <Field label="Remarks" className="md:col-span-2 xl:col-span-3">
              <Textarea value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} />
            </Field>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <div>
            <Button onClick={() => void submit()}>
              <Save className="h-4 w-4" />
              {form.id ? "Save Changes" : "Save Boulder Entry"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Boulder Table</CardTitle>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search boulder entries..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Vehicle Number</TableHead>
                <TableHead>Party Name</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.vehicleNumber}</TableCell>
                  <TableCell>{row.partyName}</TableCell>
                  <TableCell>{row.materialName}</TableCell>
                  <TableCell className="number-cell">{formatQty(row.qty, "")}</TableCell>
                  <TableCell className="max-w-56 truncate">{row.remarks}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => edit(row)} aria-label="Edit boulder entry">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete boulder entry">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No boulder entries found.
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
