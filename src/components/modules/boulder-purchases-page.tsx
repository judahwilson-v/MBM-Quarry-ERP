"use client";
import { usePrompt } from "@/components/ui/prompt-provider";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { deleteIncomingBoulder, listIncomingBoulder, saveIncomingBoulder, listVehicles, getLastBookPage } from "@/lib/offline-actions";
import { formatCurrency, formatDate, formatQty, todayInputValue } from "@/lib/utils";

type BoulderRow = {
  id: string;
  date: string;
  bookNumber?: number | null;
  pageNumber?: number | null;
  vehicleNumber: string;
  partyName: string;
  materialName: string;
  qty: number;
  remarks?: string | null;
  time?: string | null;
  rockRate: number;
  amount: number;
  cashPaid: number;
  bankPaid: number;
  gPayPaid: number;
  paidTotal: number;
  remainingCredit: number;
  vehicleRent: number;
  combinedPayment: boolean;
  createdAt: string;
};

function blankForm() {
  const now = new Date();
  return {
    id: "",
    date: todayInputValue(),
    time: now.toTimeString().slice(0, 5),
    bookNumber: "",
    pageNumber: "",
    vehicleId: "",
    vehicleNumber: "",
    partyName: "",
    qty: "",
    rockRate: "26",
    cashPaid: "0",
    bankPaid: "0",
    gPayPaid: "0",
    vehicleRent: "0",
    combinedPayment: false,
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
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { confirmAction } = usePrompt();

  useEffect(() => {
    listVehicles("").then((v) => setVehicles(v as any[]));
    if (!form.id) {
      getLastBookPage().then(({ bookNumber, pageNumber }) => {
        let nextBook = bookNumber;
        let nextPage = pageNumber + 1;
        if (nextPage > 100) {
          nextBook = bookNumber + 1;
          nextPage = 1;
        }
        setForm((prev) => ({
          ...prev,
          bookNumber: String(nextBook),
          pageNumber: String(nextPage),
        }));
      });
    }
  }, []);

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
      time: row.time ?? "",
      bookNumber: row.bookNumber != null ? String(row.bookNumber) : "",
      pageNumber: row.pageNumber != null ? String(row.pageNumber) : "",
      vehicleId: "",
      vehicleNumber: row.vehicleNumber,
      partyName: row.partyName,
      qty: String(row.qty),
      rockRate: String(row.rockRate),
      cashPaid: String(row.cashPaid),
      bankPaid: String(row.bankPaid),
      gPayPaid: String(row.gPayPaid),
      vehicleRent: String(row.vehicleRent),
      combinedPayment: row.combinedPayment,
      remarks: row.remarks ?? "",
    });
    setMessage("");
    setError("");
  }

  function selectVehicle(id: string) {
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) return;
    setForm((current) => ({
      ...current,
      vehicleId: vehicle.id,
      vehicleNumber: vehicle.vehicleNumber,
      partyName: vehicle.partyName || current.partyName,
    }));
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
    if (!(await confirmAction("Delete this boulder entry?"))) return;
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
            <Field label="Time">
              <Input type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} />
            </Field>
            <Field label="Book No">
              <Input type="number" min="1" value={form.bookNumber} onChange={(event) => setForm((current) => ({ ...current, bookNumber: event.target.value }))} />
            </Field>
            <Field label="Page No">
              <Input type="number" min="1" max="100" value={form.pageNumber} onChange={(event) => setForm((current) => ({ ...current, pageNumber: event.target.value }))} />
            </Field>
            <Field label="Vehicle Number">
              <SearchableSelect
                value={form.vehicleId}
                customValue={form.vehicleNumber}
                allowCustom
                placeholder="Search or type vehicle"
                options={vehicles.map((v) => ({ value: v.id, label: v.vehicleNumber, description: v.partyName }))}
                onChange={selectVehicle}
                onCustomValueChange={(vehicleNumber) => setForm((current) => ({ ...current, vehicleNumber, vehicleId: "" }))}
              />
            </Field>
            <Field label="Party Name">
              <Input value={form.partyName} onChange={(event) => setForm((current) => ({ ...current, partyName: event.target.value }))} />
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
            <Field label="Rock Rate (₹)">
              <Input
                className="text-right tabular-nums"
                type="number"
                step="0.01"
                value={form.rockRate}
                onChange={(event) => setForm((current) => ({ ...current, rockRate: event.target.value }))}
              />
            </Field>
            <Field label="Cash Paid">
              <Input
                className="text-right tabular-nums"
                type="number"
                value={form.cashPaid}
                onChange={(event) => setForm((current) => ({ ...current, cashPaid: event.target.value }))}
              />
            </Field>
            <Field label="Bank Paid">
              <Input
                className="text-right tabular-nums"
                type="number"
                value={form.bankPaid}
                onChange={(event) => setForm((current) => ({ ...current, bankPaid: event.target.value }))}
              />
            </Field>
            <Field label="GPay Paid">
              <Input
                className="text-right tabular-nums"
                type="number"
                value={form.gPayPaid}
                onChange={(event) => setForm((current) => ({ ...current, gPayPaid: event.target.value }))}
              />
            </Field>
            <Field label="Vehicle Rent">
              <Input
                className="text-right tabular-nums"
                type="number"
                value={form.vehicleRent}
                onChange={(event) => setForm((current) => ({ ...current, vehicleRent: event.target.value }))}
              />
            </Field>
            <div className="flex items-center space-x-2 pt-8">
              <input
                type="checkbox"
                id="combinedPayment"
                className="h-4 w-4 rounded border-gray-300"
                checked={form.combinedPayment}
                onChange={(event) => setForm((current) => ({ ...current, combinedPayment: event.target.checked }))}
              />
              <label htmlFor="combinedPayment" className="text-sm font-medium leading-none">
                Rent included in Payment
              </label>
            </div>
            <Field label="Remarks" className="md:col-span-2">
              <Textarea value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} />
            </Field>
          </div>
          <div className="flex gap-4 p-3 bg-muted/50 rounded-lg">
            <div className="text-sm">
              <span className="text-muted-foreground">Amount: </span>
              <span className="font-semibold">{formatCurrency((Number(form.qty) || 0) * (Number(form.rockRate) || 0))}</span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Paid Total: </span>
              <span className="font-semibold text-emerald-600">
                {formatCurrency((Number(form.cashPaid) || 0) + (Number(form.bankPaid) || 0) + (Number(form.gPayPaid) || 0))}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Credit Balance: </span>
              <span className="font-semibold text-destructive">
                {formatCurrency(((Number(form.qty) || 0) * (Number(form.rockRate) || 0)) - ((Number(form.cashPaid) || 0) + (Number(form.bankPaid) || 0) + (Number(form.gPayPaid) || 0)))}
              </span>
            </div>
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
                <TableHead>Time</TableHead>
                <TableHead>Book/Page</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.time || "-"}</TableCell>
                  <TableCell>
                    {row.bookNumber && row.pageNumber ? `${row.bookNumber}/${row.pageNumber}` : row.bookNumber || row.pageNumber || "-"}
                  </TableCell>
                  <TableCell>{row.vehicleNumber}</TableCell>
                  <TableCell>{row.partyName}</TableCell>
                  <TableCell className="number-cell font-medium">{formatQty(row.qty, "")}</TableCell>
                  <TableCell className="number-cell text-muted-foreground">{formatCurrency(row.rockRate)}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="number-cell text-emerald-600">{formatCurrency(row.paidTotal)}</TableCell>
                  <TableCell className="number-cell text-destructive">{formatCurrency(row.remainingCredit)}</TableCell>
                  <TableCell className="max-w-40 truncate" title={row.remarks || ""}>{row.remarks}</TableCell>
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
                  <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
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
