"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, downloadExcel } from "@/lib/export-utils";
import { formatCurrency, formatDate, todayInputValue } from "@/lib/utils";

const categories = ["MATERIAL", "DIESEL", "SPARE_PARTS", "MAINTENANCE", "SALARY", "OTHER"] as const;
const paymentTypes = ["CASH", "BANK", "GPAY"] as const;

export function PurchasesPage() {
  const [form, setForm] = useState({
    date: todayInputValue(),
    category: "MATERIAL",
    supplierId: "",
    materialId: "",
    description: "",
    qty: "",
    unit: "CFT",
    rate: "",
    amount: "",
    paymentType: "CASH",
    invoiceRef: "",
    remarks: "",
  });
  const [date, setDate] = useState(todayInputValue());
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [message, setMessage] = useState("");

  const computedAmount = useMemo(() => {
    const qty = Number(form.qty || 0);
    const rate = Number(form.rate || 0);
    return qty > 0 && rate > 0 ? (qty * rate).toFixed(2) : form.amount;
  }, [form.qty, form.rate, form.amount]);

  const load = useCallback(async () => {
    const [purchases, supplierRows, materialRows] = await Promise.all([
      fetch(`/api/v1/purchases?date=${date}&pageSize=100`).then((response) => response.json()),
      fetch("/api/v1/suppliers?pageSize=200").then((response) => response.json()),
      fetch("/api/v1/materials?pageSize=200").then((response) => response.json()),
    ]);
    setRows(purchases.data ?? []);
    setSummary(purchases.summary ?? {});
    setSuppliers(supplierRows.data ?? []);
    setMaterials(materialRows.data ?? []);
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setMessage("");
    const response = await fetch("/api/v1/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, amount: computedAmount }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Save failed.");
      return;
    }
    setMessage("Purchase saved.");
    setForm((current) => ({
      ...current,
      description: "",
      qty: "",
      rate: "",
      amount: "",
      invoiceRef: "",
      remarks: "",
    }));
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Soft-delete this purchase and reverse its stock/accounts effects?")) return;
    const response = await fetch(`/api/v1/purchases/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      setMessage(body.error ?? "Delete failed.");
      return;
    }
    await load();
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Purchases</h1>
        <p className="text-sm text-muted-foreground">Material purchases and quarry expenses with CFT material quantities.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase Entry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(event) => setForm((f) => ({ ...f, date: event.target.value }))} />
            </Field>
            <Field label="Category">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.category} onChange={(event) => setForm((f) => ({ ...f, category: event.target.value, unit: event.target.value === "MATERIAL" ? "CFT" : "" }))}>
                {categories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Supplier">
              <SearchableSelect value={form.supplierId} placeholder="Search supplier" options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name, description: supplier.phone }))} onChange={(value) => setForm((f) => ({ ...f, supplierId: value }))} />
            </Field>
            {form.category === "MATERIAL" ? (
              <Field label="Material">
                <SearchableSelect value={form.materialId} placeholder="Select material" options={materials.map((material) => ({ value: material.id, label: material.name, description: material.code }))} onChange={(value) => setForm((f) => ({ ...f, materialId: value }))} />
              </Field>
            ) : null}
            <Field label="Quantity">
              <Input className="text-right tabular-nums" type="number" step="0.001" value={form.qty} onChange={(event) => setForm((f) => ({ ...f, qty: event.target.value }))} />
            </Field>
            <Field label="Rate">
              <Input className="text-right tabular-nums" type="number" step="0.01" value={form.rate} onChange={(event) => setForm((f) => ({ ...f, rate: event.target.value }))} />
            </Field>
            <Field label="Amount">
              <Input className="text-right tabular-nums" type="number" step="0.01" value={computedAmount} onChange={(event) => setForm((f) => ({ ...f, amount: event.target.value }))} />
            </Field>
            <Field label="Payment Type">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.paymentType} onChange={(event) => setForm((f) => ({ ...f, paymentType: event.target.value }))}>
                {paymentTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </Field>
            <Field label="Description">
              <Input value={form.description} onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))} />
            </Field>
            <Field label="Invoice / Ref No">
              <Input value={form.invoiceRef} onChange={(event) => setForm((f) => ({ ...f, invoiceRef: event.target.value }))} />
            </Field>
            <Field label="Remarks" className="md:col-span-2">
              <Textarea value={form.remarks} onChange={(event) => setForm((f) => ({ ...f, remarks: event.target.value }))} />
            </Field>
          </div>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <div>
            <Button onClick={() => void submit()}>
              <Save className="h-4 w-4" />
              Save Purchase
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Purchase Table</CardTitle>
          <div className="flex gap-2">
            <Input className="w-40" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <Button variant="outline" size="sm" onClick={() => void downloadExcel(rows, "purchases.xlsx", "Purchases")}>
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCsv(rows, "purchases.csv")}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {["Date", "Category", "Supplier", "Material", "Description", "Qty", "Amount", "Payment", "Actions"].map((head) => (
                  <TableHead key={head} className={["Qty", "Amount"].includes(head) ? "text-right" : undefined}>{head}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="bg-blue-50 text-blue-700">
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>{row.category}</TableCell>
                  <TableCell>{row.supplier?.name ?? "-"}</TableCell>
                  <TableCell>{row.material?.name ?? "-"}</TableCell>
                  <TableCell>{row.description}</TableCell>
                  <TableCell className="number-cell">{row.qty ? `${row.qty} ${row.unit ?? ""}` : "-"}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.amount)}</TableCell>
                  <TableCell>{row.paymentType}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete purchase">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Summary label="Total" value={formatCurrency(summary.total ?? 0)} />
            {Object.entries(summary.byCategory ?? {}).map(([category, amount]) => (
              <Summary key={category} label={category} value={formatCurrency(amount)} />
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
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
