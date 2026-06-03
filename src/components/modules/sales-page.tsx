"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, Eye, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { downloadCsv, downloadExcel } from "@/lib/export-utils";
import { cn, formatCurrency, formatDate, formatQty, todayInputValue } from "@/lib/utils";

type SaleRow = Record<string, any>;

export function SalesPage() {
  const [date, setDate] = useState(todayInputValue());
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");

  const loadSales = useCallback(async () => {
    const response = await fetch(`/api/v1/sales?date=${date}&pageSize=100`);
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Failed to load sales.");
      return;
    }
    setSales(body.data ?? []);
    setSummary(body.summary ?? {});
  }, [date]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  async function remove(id: string) {
    if (!window.confirm("Soft-delete this sale and reverse stock/accounts effects?")) return;
    const response = await fetch(`/api/v1/sales/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Delete failed.");
      return;
    }
    await loadSales();
  }

  const selectedRows = sales.filter((row) => selected.includes(row.id));

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Sales Table</h1>
          <p className="text-sm text-muted-foreground">Daily sales rows, CFT totals, split payments, and dispatch slips.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-40" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <Button asChild>
            <Link href="/sales/new">
              <Plus className="h-4 w-4" />
              New Sale
            </Link>
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Daily Sales</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void downloadExcel(selectedRows.length ? selectedRows : sales, "sales.xlsx")}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(selectedRows.length ? selectedRows : sales, "sales.csv")}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={sales.length > 0 && selected.length === sales.length}
                    onChange={(event) => setSelected(event.target.checked ? sales.map((row) => row.id) : [])}
                  />
                </TableHead>
                {["Sl", "Date", "Time", "Vehicle", "Party", "Material", "Qty (CFT)", "Rate", "Net Amount", "Payment", "Remarks", "Actions"].map(
                  (head) => (
                    <TableHead key={head} className={["Qty (CFT)", "Rate", "Net Amount"].includes(head) ? "text-right" : undefined}>
                      {head}
                    </TableHead>
                  ),
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((row) => (
                <TableRow key={row.id} className={cn(Number(row.creditAmount ?? 0) > 0 && "bg-red-50 text-red-700")}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>{row.slNo ?? "-"}</TableCell>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.time ?? new Date(row.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell>{row.vehicle?.vehicleNumber ?? "-"}</TableCell>
                  <TableCell>{row.party?.name}</TableCell>
                  <TableCell>{row.material?.name}</TableCell>
                  <TableCell className="number-cell">{formatQty(row.qty, "")}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.rate)}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.netAmount)}</TableCell>
                  <TableCell>
                    <PaymentBadges row={row} />
                  </TableCell>
                  <TableCell className="max-w-44 truncate">{row.remarks}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {row.dispatchSlip ? (
                        <Button variant="ghost" size="icon" asChild aria-label="View dispatch slip">
                          <Link href={`/dispatch/${row.dispatchSlip.id}`}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete sale">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!sales.length ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-24 text-center text-muted-foreground">
                    No sales for selected date.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-6">
            <Summary label="Total Qty" value={formatQty(summary.totalQty ?? 0)} />
            <Summary label="Cash" value={formatCurrency(summary.cash ?? 0)} />
            <Summary label="Bank" value={formatCurrency(summary.bank ?? 0)} />
            <Summary label="GPay" value={formatCurrency(summary.gpay ?? 0)} />
            <Summary label="Credit" value={formatCurrency(summary.credit ?? 0)} />
            <Summary label="Total" value={formatCurrency(summary.totalAmount ?? 0)} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(summary.materialBreakdown ?? {}).map(([code, qty]) => (
              <div key={code} className="rounded-md border bg-background p-3 text-sm">
                <div className="text-muted-foreground">{code}</div>
                <div className="mt-1 text-lg font-semibold">{formatQty(qty)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PaymentBadges({ row }: { row: SaleRow }) {
  const parts = [
    ["Cash", row.cashAmount],
    ["Bank", row.bankAmount],
    ["GPay", row.gpayAmount],
    ["Credit", row.creditAmount],
  ].filter(([, amount]) => Number(amount ?? 0) > 0);
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map(([label, amount]) => (
        <Badge key={label} variant={label === "Credit" ? "destructive" : "secondary"}>
          {label} {formatCurrency(amount)}
        </Badge>
      ))}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
