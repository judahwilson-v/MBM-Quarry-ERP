"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, todayInputValue } from "@/lib/utils";

const transactionTypes = [
  "OPENING_BALANCE",
  "CASH_SALE",
  "BANK_SALE",
  "GPAY_SALE",
  "CREDIT_SALE",
  "PAYMENT_RECEIVED",
  "SALARY",
  "GENERATOR_EXPENSE",
  "DIESEL_EXPENSE",
  "OXYGEN_EXPENSE",
  "MAINTENANCE",
  "PURCHASE",
  "MISCELLANEOUS",
  "CLOSING_BALANCE",
];

export function AccountsPage() {
  const [book, setBook] = useState("all");
  const [date, setDate] = useState(todayInputValue());
  const [rows, setRows] = useState<any[]>([]);
  const [reconciliation, setReconciliation] = useState<any>(null);
  const [form, setForm] = useState({
    date: todayInputValue(),
    transactionType: "MISCELLANEOUS",
    details: "",
    debit: "0",
    credit: "0",
    isCash: true,
    isBank: false,
    isGpay: false,
  });
  const [message, setMessage] = useState("");

  async function load() {
    const params = new URLSearchParams({ date, pageSize: "100" });
    if (book !== "all") params.set("book", book);
    const [entries, rec] = await Promise.all([
      fetch(`/api/v1/accounts?${params.toString()}`).then((response) => response.json()),
      fetch(`/api/v1/accounts/reconciliation?date=${date}`).then((response) => response.json()),
    ]);
    setRows(entries.data ?? []);
    setReconciliation(rec);
  }

  useEffect(() => {
    void load();
  }, [book, date]);

  async function submit() {
    const response = await fetch("/api/v1/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Save failed.");
      return;
    }
    setMessage("Entry saved.");
    setForm((current) => ({ ...current, details: "", debit: "0", credit: "0" }));
    await load();
  }

  const expenseSummary = useMemo(() => {
    const grouped: Record<string, number> = {};
    rows.forEach((row) => {
      if (Number(row.debit) > 0) grouped[row.transactionType] = (grouped[row.transactionType] ?? 0) + Number(row.debit);
    });
    return Object.entries(grouped);
  }, [rows]);

  const profit = rows.reduce((sum, row) => sum + Number(row.credit) - Number(row.debit), 0);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Master Accounts Book</h1>
        <p className="text-sm text-muted-foreground">Cash book, bank book, expenses, profit, and daily reconciliation.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ReconciliationBadge label="Cash" data={reconciliation?.cash} />
        <ReconciliationBadge label="Bank" data={reconciliation?.bank} />
        <ReconciliationBadge label="GPay" data={reconciliation?.gpay} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Entry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(event) => setForm((f) => ({ ...f, date: event.target.value }))} />
          </Field>
          <Field label="Type">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.transactionType} onChange={(event) => setForm((f) => ({ ...f, transactionType: event.target.value }))}>
              {transactionTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="Debit">
            <Input className="text-right" type="number" value={form.debit} onChange={(event) => setForm((f) => ({ ...f, debit: event.target.value }))} />
          </Field>
          <Field label="Credit">
            <Input className="text-right" type="number" value={form.credit} onChange={(event) => setForm((f) => ({ ...f, credit: event.target.value }))} />
          </Field>
          <div className="flex items-end gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isCash} onChange={(event) => setForm((f) => ({ ...f, isCash: event.target.checked }))} />
              Cash
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isBank} onChange={(event) => setForm((f) => ({ ...f, isBank: event.target.checked }))} />
              Bank
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isGpay} onChange={(event) => setForm((f) => ({ ...f, isGpay: event.target.checked }))} />
              GPay
            </label>
          </div>
          <div className="flex items-end">
            <Button onClick={() => void submit()}>Save</Button>
          </div>
          <Field label="Details" className="md:col-span-3 xl:col-span-6">
            <Textarea value={form.details} onChange={(event) => setForm((f) => ({ ...f, details: event.target.value }))} />
          </Field>
          {message ? <p className="md:col-span-3 xl:col-span-6 text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{book === "cash" ? "Cash Book" : book === "bank" ? "Bank Book" : "Accounts Entries"}</CardTitle>
          <div className="flex gap-2">
            <Input className="w-40" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={book} onChange={(event) => setBook(event.target.value)}>
              <option value="all">All</option>
              <option value="cash">Cash Book</option>
              <option value="bank">Bank Book</option>
              <option value="gpay">GPay Book</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Running</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.transactionType}</TableCell>
                  <TableCell>{row.details}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.debit)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.credit)}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.runningBalance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Expense Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {expenseSummary.map(([type, amount]) => (
              <div key={type} className="flex justify-between rounded-md border p-3 text-sm">
                <span>{type}</span>
                <span className="font-medium">{formatCurrency(amount)}</span>
              </div>
            ))}
            {!expenseSummary.length ? <p className="text-sm text-muted-foreground">No expenses for this view.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profit Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border p-5">
              <div className="text-sm text-muted-foreground">Credits minus expenses in current view</div>
              <div className="mt-2 text-3xl font-semibold">{formatCurrency(profit)}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReconciliationBadge({ label, data }: { label: string; data?: any }) {
  const balanced = data?.balanced;
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-5">
        <div>
          <div className="text-sm font-medium">{label} Reconciliation</div>
          <div className="text-xs text-muted-foreground">
            Sales {formatCurrency(data?.sales ?? 0)} / Accounts {formatCurrency(data?.accounts ?? 0)}
          </div>
        </div>
        <Badge variant={balanced ? "success" : "warning"}>
          {balanced ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <TriangleAlert className="mr-1 h-3 w-3" />}
          {balanced ? "Balanced" : `Mismatch ${formatCurrency(data?.delta ?? 0)}`}
        </Badge>
      </CardContent>
    </Card>
  );
}
