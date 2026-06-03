"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, todayInputValue } from "@/lib/utils";

const reasons = ["Advance", "Diesel", "Personal", "Other"];

export function PendingBookPage() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [form, setForm] = useState({
    employeeId: "",
    date: todayInputValue(),
    amount: "",
    reason: "Advance",
    notes: "",
  });
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [pending, employeeRows] = await Promise.all([
      fetch("/api/v1/pending-book?status=pending").then((response) => response.json()),
      fetch("/api/v1/employees?pageSize=200").then((response) => response.json()),
    ]);
    setRows(pending.data ?? []);
    setSummary(pending.summary ?? {});
    setEmployees(employeeRows.data ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setMessage("");
    const response = await fetch("/api/v1/pending-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Save failed.");
      return;
    }
    setMessage("Pending entry saved.");
    setForm((current) => ({ ...current, amount: "", notes: "" }));
    await load();
  }

  async function processDeductions(employeeId?: string) {
    const response = await fetch("/api/v1/pending-book/process-deductions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Deduction failed.");
      return;
    }
    setMessage(`${body.count ?? 0} pending entries marked deducted.`);
    await load();
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Pending Book</h1>
          <p className="text-sm text-muted-foreground">Worker advances and mid-month expenses for month-end deduction.</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/masters/employees">Manage Employees</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending Entry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_160px_160px_160px]">
          <Field label="Employee">
            <SearchableSelect value={form.employeeId} placeholder="Select employee" options={employees.map((employee) => ({ value: employee.id, label: employee.name, description: employee.role }))} onChange={(value) => setForm((f) => ({ ...f, employeeId: value }))} />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.date} onChange={(event) => setForm((f) => ({ ...f, date: event.target.value }))} />
          </Field>
          <Field label="Amount">
            <Input className="text-right" type="number" value={form.amount} onChange={(event) => setForm((f) => ({ ...f, amount: event.target.value }))} />
          </Field>
          <Field label="Reason">
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.reason} onChange={(event) => setForm((f) => ({ ...f, reason: event.target.value }))}>
              {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
            </select>
          </Field>
          <Field label="Notes" className="md:col-span-3">
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

      <div className="grid gap-4 lg:grid-cols-2">
        {(summary.byEmployee ?? []).map((group: any) => (
          <Card key={group.employee.id}>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{group.employee.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{group.employee.role}</p>
              </div>
              <Button size="sm" onClick={() => void processDeductions(group.employee.id)}>
                <CheckCircle2 className="h-4 w-4" />
                Mark All Deducted
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.filter((row) => row.employeeId === group.employee.id).map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>{formatCurrency(row.amount)}</TableCell>
                      <TableCell>{row.reason}</TableCell>
                      <TableCell><Badge variant="warning">Pending</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 rounded-md border bg-background p-3 text-sm">
                Total Pending: <span className="font-semibold">{formatCurrency(group.totalPending)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Month-End Deductions</CardTitle>
          <Button onClick={() => void processDeductions()}>
            <CheckCircle2 className="h-4 w-4" />
            Process Month End Deductions
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Total pending across employees: {formatCurrency(summary.totalPending ?? 0)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
