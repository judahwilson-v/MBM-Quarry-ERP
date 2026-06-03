"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, FileSpreadsheet, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, downloadExcel, downloadSimplePdf } from "@/lib/export-utils";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

export function CreditListPage({ mode }: { mode: "list" | "outstanding" }) {
  const [threshold, setThreshold] = useState("0");
  const [rows, setRows] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const endpoint = mode === "list" ? "list" : "outstanding";
      const body = await fetch(`/api/v1/credit/${endpoint}?threshold=${threshold}`).then((response) => response.json());
      setRows(body.data ?? []);
    }
    void load();
  }, [threshold, mode]);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <Header title={mode === "list" ? "Credit List" : "Outstanding Report"} rows={rows} />
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Outstanding Parties</CardTitle>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={threshold} onChange={(event) => setThreshold(event.target.value)}>
            <option value="0">All</option>
            <option value="30">30+ days</option>
            <option value="60">60+ days</option>
            <option value="90">90+ days</option>
          </select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead className="text-right">Total Outstanding</TableHead>
                <TableHead>Last Transaction</TableHead>
                <TableHead className="text-right">Days Overdue</TableHead>
                <TableHead>Ledger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.party.id}>
                  <TableCell>{row.party.name}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.totalOutstanding)}</TableCell>
                  <TableCell>{formatDate(row.lastTransactionDate)}</TableCell>
                  <TableCell className="number-cell">
                    <Badge variant={row.daysOverdue >= 90 ? "destructive" : row.daysOverdue >= 30 ? "warning" : "secondary"}>
                      {row.daysOverdue}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/credit/ledger/${row.party.id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function AgeingPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    async function load() {
      const body = await fetch(`/api/v1/credit/ageing?asOf=${asOf}`).then((response) => response.json());
      setRows(body.data ?? []);
    }
    void load();
  }, [asOf]);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <Header title="Ageing Report" rows={rows} />
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Ageing Buckets</CardTitle>
          <Input className="w-44" type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead className="text-right">0-30</TableHead>
                <TableHead className="text-right">31-60</TableHead>
                <TableHead className="text-right">61-90</TableHead>
                <TableHead className="text-right">90+</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.party.id}>
                  <TableCell>{row.party.name}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.b0_30)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.b31_60)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.b61_90)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.b90)}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function LedgerPage({ partyId }: { partyId: string }) {
  const [data, setData] = useState<any>({ rows: [] });
  const [payment, setPayment] = useState({ amount: "", method: "CASH", details: "" });
  const [message, setMessage] = useState("");

  async function load() {
    const body = await fetch(`/api/v1/credit/ledger/${partyId}`).then((response) => response.json());
    setData(body);
  }

  useEffect(() => {
    void load();
  }, [partyId]);

  async function recordPayment() {
    const response = await fetch("/api/v1/credit/payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partyId, ...payment }),
    });
    if (response.ok) {
      setPayment({ amount: "", method: "CASH", details: "" });
      setMessage("Payment recorded.");
      await load();
    } else {
      const body = await response.json();
      setMessage(body.error ?? "Payment failed.");
    }
  }

  const rows = data.rows ?? [];

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <Header title={`Ledger - ${data.party?.name ?? ""}`} rows={rows} />
      <Card>
        <CardHeader>
          <CardTitle>Record Payment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_160px_1fr_auto]">
          <Field label="Amount">
            <Input className="text-right" type="number" value={payment.amount} onChange={(event) => setPayment((p) => ({ ...p, amount: event.target.value }))} />
          </Field>
          <Field label="Method">
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={payment.method}
              onChange={(event) => setPayment((p) => ({ ...p, method: event.target.value }))}
            >
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
              <option value="GPAY">GPay</option>
            </select>
          </Field>
          <Field label="Details">
            <Textarea value={payment.details} onChange={(event) => setPayment((p) => ({ ...p, details: event.target.value }))} />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void recordPayment()}>
              <Plus className="h-4 w-4" />
              Record
            </Button>
          </div>
          {message ? <p className="md:col-span-4 text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Party Ledger - Outstanding {formatCurrency(data.party?.currentBalance ?? 0)}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Running Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    Number(row.debitAmount ?? 0) > 0 && "bg-red-50 text-red-700",
                    Number(row.creditAmount ?? 0) > 0 && "bg-green-50 text-green-700",
                  )}
                >
                  <TableCell>{row.date ? formatDate(row.date) : "-"}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell>{row.sale?.vehicle?.vehicleNumber ?? "-"}</TableCell>
                  <TableCell>{row.sale?.material?.name ?? "-"}</TableCell>
                  <TableCell className="number-cell">{row.sale?.qty ?? "-"}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.debitAmount)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.creditAmount)}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.runningBalance)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Header({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
        <p className="text-sm text-muted-foreground">Credit balances, overdue status, collections, and exports.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void downloadExcel(rows, `${title.toLowerCase().replaceAll(" ", "-")}.xlsx`, title)}>
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </Button>
        <Button variant="outline" onClick={() => downloadCsv(rows, `${title.toLowerCase().replaceAll(" ", "-")}.csv`)}>
          <Download className="h-4 w-4" />
          CSV
        </Button>
        <Button variant="outline" onClick={() => void downloadSimplePdf({ title, rows, fileName: `${title.toLowerCase().replaceAll(" ", "-")}.pdf` })}>
          PDF
        </Button>
      </div>
    </div>
  );
}
