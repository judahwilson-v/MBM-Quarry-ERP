"use client";

import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, downloadExcel, downloadSimplePdf, flattenRow } from "@/lib/export-utils";
import { cn, todayInputValue } from "@/lib/utils";

const reportTypes = [
  ["daily-sales", "Daily Sales"],
  ["weekly-sales", "Weekly Sales"],
  ["monthly-sales", "Monthly Sales"],
  ["boulder-purchase-report", "Boulder Purchase"],
  ["material-wise-report", "Material-wise Report"],
  ["customer-ledger", "Customer Ledger"],
  ["supplier-ledger", "Supplier Ledger"],
  ["daily-purchases", "Expense Purchases"],
  ["outstanding-report", "Outstanding Report"],
  ["vehicle-report", "Vehicle Report"],
  ["material-report", "Material Report"],
  ["pending-book-report", "Pending Book Report"],
  ["credit-report", "Credit Report"],
  ["ageing-report", "Ageing Report"],
  ["expense-report", "Expense Report"],
  ["stock-report", "Stock Report"],
] as const;

export function ReportsPage() {
  const [reportType, setReportType] = useState("daily-sales");
  const [from, setFrom] = useState(todayInputValue());
  const [to, setTo] = useState(todayInputValue());
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState("Daily Sales");
  const [message, setMessage] = useState("");

  async function runReport() {
    const label = reportTypes.find(([value]) => value === reportType)?.[1] ?? "Report";
    setTitle(label);
    const params = new URLSearchParams({ from, to });
    const response = await fetch(`/api/v1/reports/${reportType}?${params.toString()}`);
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Report failed.");
      return;
    }
    setRows(body.data ?? []);
    setMessage(`${body.data?.length ?? 0} rows loaded.`);
  }

  const flattened = rows.map(flattenRow);
  const headers = Object.keys(flattened[0] ?? {}).slice(0, 10);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Reports</h1>
        <p className="text-sm text-muted-foreground">Parameterized reports with PDF, Excel, and CSV download.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Report Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]">
          <Field label="Report">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={reportType} onChange={(event) => setReportType(event.target.value)}>
              {reportTypes.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button onClick={() => void runReport()}>Run</Button>
          </div>
          {message ? <p className="md:col-span-4 text-sm text-muted-foreground">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void downloadExcel(rows, `${reportType}.xlsx`, title)}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(rows, `${reportType}.csv`)}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => void downloadSimplePdf({ title, rows, fileName: `${reportType}.pdf` })}>
              PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {flattened.map((row, index) => (
                <TableRow
                  key={index}
                  className={cn(
                    reportType === "boulder-purchase-report" && "border-l-4 border-l-red-300 bg-red-50/60 text-slate-900",
                    reportType === "daily-purchases" && "bg-slate-50 text-slate-800",
                    (Number(rows[index]?.debitAmount ?? 0) > 0 || (rows[index]?.paymentType === "CREDIT" && Number(rows[index]?.creditAmount ?? 0) > 0)) &&
                      "bg-red-50 text-red-700",
                    Number(rows[index]?.creditAmount ?? 0) > 0 && rows[index]?.entryType === "PAYMENT_RECEIVED" && "bg-green-50 text-green-700",
                  )}
                >
                  {headers.map((header) => (
                    <TableCell key={header}>{String(row[header] ?? "")}</TableCell>
                  ))}
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={Math.max(headers.length, 1)} className="h-24 text-center text-muted-foreground">
                    Run a report to view rows.
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
