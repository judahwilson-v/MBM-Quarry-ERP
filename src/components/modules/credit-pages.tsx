"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteEmployeeCredit,
  listEmployeeCredits,
  listPartyCreditEntries,
  listPartyCreditSummary,
  saveEmployeeCredit,
} from "@/lib/offline-actions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type PartySummary = {
  partyName: string;
  totalCredit: number;
  truckCount: number;
};

type PartyCreditEntry = {
  id: string;
  partyName: string;
  saleId: string;
  amount: number;
  status: string;
  createdAt: string;
  sale?: {
    serialNumber: number;
    saleDate: string;
    vehicleNumber: string;
    materialName: string;
    qty: number;
  } | null;
};

type EmployeeCreditRow = {
  id: string;
  employeeName: string;
  amount: number;
  reason?: string | null;
  expectedDueDate?: string | null;
  status: string;
  createdAt: string;
};

function blankEmployeeForm() {
  return {
    id: "",
    employeeName: "",
    amount: "",
    reason: "",
    expectedDueDate: "",
    status: "pending",
  };
}

function dateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function PartyCreditPage() {
  const [summary, setSummary] = useState<PartySummary[]>([]);
  const [selectedParty, setSelectedParty] = useState("");
  const [entries, setEntries] = useState<PartyCreditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      setSummary((await listPartyCreditSummary()) as unknown as PartySummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load party credit.");
    }
  }, []);

  const loadEntries = useCallback(async (partyName: string) => {
    setSelectedParty(partyName);
    setEntries((await listPartyCreditEntries(partyName)) as unknown as PartyCreditEntry[]);
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const visibleSummary = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? summary.filter((row) => row.partyName.toLowerCase().includes(query)) : summary;
  }, [search, summary]);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Party Credit</h1>
        <p className="text-sm text-muted-foreground">Credits grouped by party from outgoing sales.</p>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Party Summary</CardTitle>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search party..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party Name</TableHead>
                <TableHead className="text-right">Total Credit</TableHead>
                <TableHead className="text-right">Truck Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSummary.map((row) => (
                <TableRow
                  key={row.partyName}
                  className={cn("cursor-pointer", selectedParty === row.partyName && "bg-accent/70")}
                  onClick={() => void loadEntries(row.partyName)}
                >
                  <TableCell className="font-medium">{row.partyName}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.totalCredit)}</TableCell>
                  <TableCell className="number-cell">{row.truckCount}</TableCell>
                </TableRow>
              ))}
              {!visibleSummary.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No party credit records found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedParty ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedParty} Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Serial</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.sale?.saleDate ?? entry.createdAt)}</TableCell>
                    <TableCell>{entry.sale?.serialNumber ?? "-"}</TableCell>
                    <TableCell>{entry.sale?.vehicleNumber ?? "-"}</TableCell>
                    <TableCell>{entry.sale?.materialName ?? "-"}</TableCell>
                    <TableCell className="number-cell">{entry.sale?.qty ?? "-"}</TableCell>
                    <TableCell className="number-cell font-medium">{formatCurrency(entry.amount)}</TableCell>
                    <TableCell className="capitalize">{entry.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function EmployeeCreditPage() {
  const [rows, setRows] = useState<EmployeeCreditRow[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(() => blankEmployeeForm());
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setRows((await listEmployeeCredits(search)) as unknown as EmployeeCreditRow[]);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  function startCreate() {
    setForm(blankEmployeeForm());
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function startEdit(row: EmployeeCreditRow) {
    setForm({
      id: row.id,
      employeeName: row.employeeName,
      amount: String(row.amount),
      reason: row.reason ?? "",
      expectedDueDate: dateInput(row.expectedDueDate),
      status: row.status,
    });
    setShowForm(true);
    setError("");
    setMessage("");
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      await saveEmployeeCredit(form);
      setMessage(form.id ? "Employee credit updated." : "Employee credit added.");
      setForm(blankEmployeeForm());
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this employee credit?")) return;
    setError("");
    try {
      await deleteEmployeeCredit(id);
      if (form.id === id) setForm(blankEmployeeForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Employee Credit</h1>
          <p className="text-sm text-muted-foreground">Employee advance and credit records.</p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search employee credit..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          {showForm ? (
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">{form.id ? "Edit Employee Credit" : "New Employee Credit"}</div>
                <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} aria-label="Close form">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Employee Name">
                  <Input value={form.employeeName} onChange={(event) => setForm((current) => ({ ...current, employeeName: event.target.value }))} />
                </Field>
                <Field label="Amount">
                  <Input
                    className="text-right tabular-nums"
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  />
                </Field>
                <Field label="Expected Due Date">
                  <Input
                    type="date"
                    value={form.expectedDueDate}
                    onChange={(event) => setForm((current) => ({ ...current, expectedDueDate: event.target.value }))}
                  />
                </Field>
                <Field label="Status">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
                <Field label="Reason" className="md:col-span-2 xl:col-span-4">
                  <Textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
                </Field>
              </div>
              <div className="mt-4">
                <Button onClick={() => void submit()}>
                  <Save className="h-4 w-4" />
                  {form.id ? "Save Changes" : "Create"}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee Name</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Expected Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.employeeName}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="max-w-64 truncate">{row.reason}</TableCell>
                  <TableCell>{row.expectedDueDate ? formatDate(row.expectedDueDate) : "-"}</TableCell>
                  <TableCell className="capitalize">{row.status}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(row)} aria-label="Edit employee credit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete employee credit">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No employee credit records found.
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
