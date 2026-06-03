"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { downloadCsv, downloadExcel } from "@/lib/export-utils";
import { currentTimeInputValue, formatCurrency, formatDate, formatQty, todayInputValue } from "@/lib/utils";

type Master = Record<string, any>;

function blankForm() {
  return {
    date: todayInputValue(),
    time: currentTimeInputValue(),
    vehicleId: "",
    vehicleNumber: "",
    supplierId: "",
    supplierName: "",
    material: "Boulder",
    qty: "",
    rate: "",
    amount: "",
    remarks: "",
  };
}

export function BoulderPurchasesPage() {
  const [form, setForm] = useState(() => blankForm());
  const [date, setDate] = useState(todayInputValue());
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [vehicles, setVehicles] = useState<Master[]>([]);
  const [suppliers, setSuppliers] = useState<Master[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const computedAmount = useMemo(() => {
    const qty = Number(form.qty || 0);
    const rate = Number(form.rate || 0);
    return qty > 0 && rate > 0 ? (qty * rate).toFixed(2) : form.amount;
  }, [form.amount, form.qty, form.rate]);

  const load = useCallback(async () => {
    const [entryRows, vehicleRows, supplierRows] = await Promise.all([
      fetch(`/api/v1/purchase-entries?date=${date}&pageSize=100`).then((response) => response.json()),
      fetch("/api/v1/vehicles?pageSize=500").then((response) => response.json()),
      fetch("/api/v1/suppliers?pageSize=500").then((response) => response.json()),
    ]);
    setRows(entryRows.data ?? []);
    setSummary(entryRows.summary ?? {});
    setVehicles(vehicleRows.data ?? []);
    setSuppliers(supplierRows.data ?? []);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  function selectVehicle(vehicleId: string) {
    const vehicle = vehicles.find((row) => row.id === vehicleId);
    setForm((current) => ({ ...current, vehicleId, vehicleNumber: vehicle?.vehicleNumber ?? current.vehicleNumber }));
  }

  function selectSupplier(supplierId: string) {
    const supplier = suppliers.find((row) => row.id === supplierId);
    setForm((current) => ({ ...current, supplierId, supplierName: supplier?.name ?? current.supplierName }));
  }

  async function submit() {
    setError("");
    setMessage("");
    if (!navigator.onLine) {
      setError("Internet connection is required. Boulder purchases are saved directly to the production database.");
      return;
    }
    if (!form.vehicleNumber.trim()) {
      setError("Vehicle Number is required.");
      return;
    }
    if (!form.supplierName.trim()) {
      setError("Supplier Name is required.");
      return;
    }
    if (Number(form.qty) <= 0 || Number(form.rate) <= 0) {
      setError("Quantity and Rate must be greater than 0.");
      return;
    }

    const response = await fetch("/api/v1/purchase-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: computedAmount }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Save failed.");
      return;
    }
    setMessage("Boulder purchase saved.");
    setForm((current) => ({
      ...blankForm(),
      date: current.date,
      time: currentTimeInputValue(),
      supplierId: current.supplierId,
      supplierName: current.supplierName,
      material: current.material,
      rate: current.rate,
    }));
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Soft-delete this boulder purchase entry?")) return;
    const response = await fetch(`/api/v1/purchase-entries/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Delete failed.");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">OUR PURCHASE (BOULDER)</h1>
        <p className="text-sm text-muted-foreground">Incoming boulder truck register with separate supplier totals.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Boulder Purchase Entry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </Field>
            <Field label="Time">
              <Input type="time" value={form.time} onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))} />
            </Field>
            <Field label="Vehicle Number">
              <SearchableSelect
                value={form.vehicleId}
                customValue={form.vehicleNumber}
                allowCustom
                placeholder="Type vehicle"
                options={vehicles.map((vehicle) => ({ value: vehicle.id, label: vehicle.vehicleNumber, description: vehicle.ownerName }))}
                onChange={selectVehicle}
                onCustomValueChange={(vehicleNumber) =>
                  setForm((current) => ({ ...current, vehicleNumber, vehicleId: vehicleNumber === current.vehicleNumber ? current.vehicleId : "" }))
                }
              />
            </Field>
            <Field label="Supplier Name">
              <SearchableSelect
                value={form.supplierId}
                customValue={form.supplierName}
                allowCustom
                placeholder="Type supplier"
                options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: supplier.phone }))}
                onChange={selectSupplier}
                onCustomValueChange={(supplierName) =>
                  setForm((current) => ({ ...current, supplierName, supplierId: supplierName === current.supplierName ? current.supplierId : "" }))
                }
              />
            </Field>
            <Field label="Material">
              <Input value={form.material} onChange={(event) => setForm((current) => ({ ...current, material: event.target.value }))} />
            </Field>
            <Field label="Quantity">
              <Input className="text-right tabular-nums" type="number" step="0.001" value={form.qty} onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))} />
            </Field>
            <Field label="Rate">
              <Input className="text-right tabular-nums" type="number" step="0.01" value={form.rate} onChange={(event) => setForm((current) => ({ ...current, rate: event.target.value }))} />
            </Field>
            <Field label="Amount">
              <Input className="text-right tabular-nums" type="number" step="0.01" value={computedAmount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
            </Field>
            <Field label="Remarks" className="md:col-span-2 xl:col-span-4">
              <Textarea value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} />
            </Field>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <div>
            <Button onClick={() => void submit()}>
              <Save className="h-4 w-4" />
              Save Boulder Purchase
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Boulder Purchase Register</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Input className="w-40" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <Button variant="outline" size="sm" onClick={() => void downloadExcel(rows, "boulder-purchases.xlsx", "Boulder Purchases")}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(rows, "boulder-purchases.csv")}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                {["Date", "Time", "Vehicle", "Supplier", "Material", "Qty", "Rate", "Amount", "Remarks", "Actions"].map((head) => (
                  <TableHead key={head} className={["Qty", "Rate", "Amount"].includes(head) ? "text-right" : undefined}>{head}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="border-l-4 border-l-red-300 bg-red-50/60 text-slate-900">
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.time ?? new Date(row.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell>{row.vehicleNumber}</TableCell>
                  <TableCell>{row.supplierName}</TableCell>
                  <TableCell>{row.material}</TableCell>
                  <TableCell className="number-cell">{formatQty(row.qty)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.rate)}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="max-w-44 truncate">{row.remarks}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete boulder purchase">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                    No boulder purchases for selected date.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Total Quantity" value={formatQty(summary.totalQty ?? 0)} />
            <Summary label="Total Amount" value={formatCurrency(summary.totalAmount ?? 0)} />
            {Object.entries(summary.bySupplier ?? {}).slice(0, 6).map(([supplier, amount]) => (
              <Summary key={supplier} label={supplier} value={formatCurrency(amount)} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold tabular-nums">{value}</div>
    </div>
  );
}
