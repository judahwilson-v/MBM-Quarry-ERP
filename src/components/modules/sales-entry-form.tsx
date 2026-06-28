"use client";
import { usePrompt } from "@/components/ui/prompt-provider";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { listMaterials, listVehicles, saveSale, getLastBookPage } from "@/lib/offline-actions";
import { deriveSalesEngine } from "@/lib/sales-engine";
import { verifyEditPassword } from "@/lib/domain";
import { formatCurrency, todayInputValue } from "@/lib/utils";

type VehicleRow = {
  id: string;
  vehicleNumber: string;
  partyName?: string | null;
  companyBodyQty?: number | null;
  extraBodyQty?: number | null;
};

type MaterialRow = {
  id: string;
  materialName: string;
  ratePerCft: number;
};

export type EditableSale = {
  id: string;
  saleDate: string;
  vehicleNumber: string;
  partyName: string;
  materialName: string;
  ratePerCft: number;
  qty: number;
  discountType: "percentage" | "fixed";
  discountValue: number;
  gstEnabled?: boolean | null;
  cashPaid?: number | null;
  bankPaid?: number | null;
  gPayPaid?: number | null;
  remainingCredit?: number | null;
  remarks?: string | null;
  bookNumber?: number | null;
  pageNumber?: number | null;
};

type SaleForm = {
  id?: string;
  saleDate: string;
  vehicleId: string;
  vehicleNumber: string;
  partyName: string;
  materialId: string;
  materialName: string;
  ratePerCft: string;
  qty: string;
  quantityReason: string;
  gstEnabled: boolean;
  discountType: "percentage" | "fixed";
  discountValue: string;
  cashPaid: string;
  bankPaid: string;
  gPayPaid: string;
  remarks: string;
  bookNumber: string;
  pageNumber: string;
};

function blankSale(): SaleForm {
  return {
    saleDate: todayInputValue(),
    vehicleId: "",
    vehicleNumber: "",
    partyName: "",
    materialId: "",
    materialName: "",
    ratePerCft: "",
    qty: "",
    quantityReason: "",
    discountType: "fixed",
    discountValue: "0",
    gstEnabled: false,
    cashPaid: "0",
    bankPaid: "0",
    gPayPaid: "0",
    remarks: "",
    bookNumber: "",
    pageNumber: "",
  };
}

function dateInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

const HIDDEN_MATERIALS = new Set(["OPENING BALANCE", "RAW SALE"]);

export function SalesEntryForm({
  editingSale,
  onSaved,
  onCancelEdit,
}: {
  editingSale?: EditableSale | null;
  onSaved?: () => void;
  onCancelEdit?: () => void;
}) {
  const [form, setForm] = useState<SaleForm>(() => blankSale());
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { promptPassword } = usePrompt();

  const loadMasters = useCallback(async () => {
    try {
      const [vehicleRows, materialRows] = await Promise.all([listVehicles(), listMaterials()]);
      setVehicles(vehicleRows as unknown as VehicleRow[]);
      setMaterials((materialRows as unknown as MaterialRow[]).filter(
        (row) => !HIDDEN_MATERIALS.has(row.materialName)
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load materials/vehicles.");
    }
  }, []);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    if (!editingSale) {
      setForm(blankSale());
      return;
    }
    const matchedMaterial = materials.find((material) => material.materialName === editingSale.materialName);
    const matchedVehicle = vehicles.find((vehicle) => vehicle.vehicleNumber === editingSale.vehicleNumber);
    setForm({
      id: editingSale.id,
      saleDate: dateInput(editingSale.saleDate),
      vehicleId: matchedVehicle?.id ?? "",
      vehicleNumber: editingSale.vehicleNumber,
      partyName: editingSale.partyName,
      materialId: matchedMaterial?.id ?? "",
      materialName: editingSale.materialName,
      ratePerCft: String(editingSale.ratePerCft),
      qty: String(editingSale.qty),
      quantityReason: "",
      discountType: editingSale.discountType,
      discountValue: String(editingSale.discountValue),
      gstEnabled: editingSale.gstEnabled ?? false,
      cashPaid: String(editingSale.cashPaid ?? 0),
      bankPaid: String(editingSale.bankPaid ?? 0),
      gPayPaid: String(editingSale.gPayPaid ?? 0),
      remarks: editingSale.remarks ?? "",
      bookNumber: editingSale.bookNumber != null ? String(editingSale.bookNumber) : "",
      pageNumber: editingSale.pageNumber != null ? String(editingSale.pageNumber) : "",
    });
    setMessage("");
    setError("");
  }, [editingSale, materials, vehicles]);

  // Auto-populate book/page from last sale when creating new
  useEffect(() => {
    if (editingSale) return;
    getLastBookPage().then(({ bookNumber, pageNumber }) => {
      let nextBook = bookNumber;
      let nextPage = pageNumber + 1;
      if (nextPage > 50) {
        nextBook = bookNumber + 1;
        nextPage = 1;
      }
      setForm((current) => ({
        ...current,
        bookNumber: String(nextBook),
        pageNumber: String(nextPage),
      }));
    }).catch(console.error);
  }, [editingSale]);

  const totals = useMemo(() => {
    const material = materials.find((row) => row.id === form.materialId);
    if (!material) return { amount: 0, discount: 0, subtotal: 0, sgst: 0, cgst: 0, gstAmount: 0, finalAmount: 0, remainingCredit: 0 };
    const vehicle = vehicles.find((row) => row.id === form.vehicleId) ?? null;
    try {
      const engine = deriveSalesEngine(
        {
          ...form,
          gPayPaid: form.gPayPaid,
        },
        { vehicle, material },
      );
      return {
        amount: engine.amount,
        discount: engine.discountAmount,
        subtotal: engine.amount - engine.discountAmount,
        sgst: engine.sgst,
        cgst: engine.cgst,
        gstAmount: engine.gstAmount,
        finalAmount: engine.finalAmount,
        remainingCredit: engine.remainingCredit,
      };
    } catch {
      return { amount: 0, discount: 0, subtotal: 0, sgst: 0, cgst: 0, gstAmount: 0, finalAmount: 0, remainingCredit: 0 };
    }
  }, [form, materials, vehicles]);

  function updateForm<K extends keyof SaleForm>(key: K, value: SaleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectVehicle(vehicleId: string) {
    const vehicle = vehicles.find((row) => row.id === vehicleId);
    const defaultQty = vehicle?.companyBodyQty ?? vehicle?.extraBodyQty ?? null;
    setForm((current) => ({
      ...current,
      vehicleId,
      vehicleNumber: vehicle?.vehicleNumber ?? current.vehicleNumber,
      partyName: vehicle?.partyName ?? current.partyName,
      qty: defaultQty !== null ? String(defaultQty) : current.qty,
      quantityReason: "",
    }));
  }

  function selectMaterial(materialId: string) {
    const material = materials.find((row) => row.id === materialId);
    setForm((current) => ({
      ...current,
      materialId,
      materialName: material?.materialName ?? current.materialName,
      ratePerCft: material ? String(material.ratePerCft) : current.ratePerCft,
    }));
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      if (form.id) {
        const password = await promptPassword("Enter edit password:");
        if (!password || !verifyEditPassword(password)) {
          throw new Error("Edit password is invalid.");
        }
      }
      await saveSale({
        id: form.id,
        saleDate: form.saleDate,
        vehicleNumber: form.vehicleNumber,
        partyName: form.partyName,
        materialId: form.materialId,
        ratePerCft: form.ratePerCft,
        qty: form.qty,
        quantityReason: form.quantityReason,
        gstEnabled: form.gstEnabled,
        discountType: form.discountType,
        discountValue: form.discountValue,
        cashPaid: form.cashPaid,
        bankPaid: form.bankPaid,
        gPayPaid: form.gPayPaid,
        remarks: form.remarks,
        bookNumber: form.bookNumber,
        pageNumber: form.pageNumber,
      });
      setMessage(form.id ? "Sale updated." : "Sale saved.");
      setForm(blankSale());
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sale.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{form.id ? "Edit Sale" : "Sales Entry"}</CardTitle>
        {form.id && onCancelEdit ? (
          <Button variant="ghost" size="icon" onClick={onCancelEdit} aria-label="Cancel edit">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Date">
            <Input type="date" value={form.saleDate} onChange={(e) => updateForm("saleDate", e.target.value)} />
          </Field>
          <Field label="Vehicle Number">
            <SearchableSelect
              value={form.vehicleId}
              customValue={form.vehicleNumber}
              allowCustom
              placeholder="Search or type vehicle"
              options={vehicles.map((vehicle) => ({
                value: vehicle.id,
                label: vehicle.vehicleNumber,
                description: [vehicle.partyName, vehicle.companyBodyQty ? `${vehicle.companyBodyQty} CFT` : ""]
                  .filter(Boolean)
                  .join(" • "),
              }))}
              onChange={selectVehicle}
              onCustomValueChange={(vehicleNumber) =>
                setForm((current) => ({
                  ...current,
                  vehicleNumber,
                  vehicleId: vehicleNumber === current.vehicleNumber ? current.vehicleId : "",
                  quantityReason: current.quantityReason,
                }))
              }
            />
          </Field>
          <Field label="Party Name">
            <Input value={form.partyName} onChange={(e) => updateForm("partyName", e.target.value)} />
          </Field>
          <Field label="Material">
            <SearchableSelect
              value={form.materialId}
              placeholder="Select material"
              options={materials.map((material) => ({
                value: material.id,
                label: material.materialName,
                description: `₹${material.ratePerCft}/CFT`,
              }))}
              onChange={selectMaterial}
            />
          </Field>
          <Field label="Rate (₹/CFT)">
            <Input
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              value={form.ratePerCft}
              onChange={(e) => updateForm("ratePerCft", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Qty (CFT)">
            <Input
              className="text-right tabular-nums"
              type="number"
              step="0.001"
              value={form.qty}
              onChange={(e) => updateForm("qty", e.target.value)}
            />
          </Field>

          <Field label="Discount Type">
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.discountType}
              onChange={(event) => updateForm("discountType", event.target.value as "percentage" | "fixed")}
            >
              <option value="fixed">Fixed Amount</option>
              <option value="percentage">Percentage</option>
            </select>
          </Field>
          <Field label={form.discountType === "percentage" ? "Discount (%)" : "Discount Amount"}>
            <Input
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              value={form.discountValue}
              onChange={(e) => updateForm("discountValue", e.target.value)}
            />
          </Field>
          <Field label="GST (5%)" className="md:col-span-2">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={form.gstEnabled}
                  onChange={(e) => updateForm("gstEnabled", e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                <span className="ms-3 text-sm font-medium">{form.gstEnabled ? "GST Enabled" : "No GST"}</span>
              </label>
            </div>
            {form.gstEnabled && totals.gstAmount > 0 && (
              <div className="mt-2 flex flex-wrap gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
                <span className="text-red-700">SGST (2.5%): <strong>{formatCurrency(totals.sgst)}</strong></span>
                <span className="text-red-700">CGST (2.5%): <strong>{formatCurrency(totals.cgst)}</strong></span>
                <span className="text-red-800 font-bold">GST Total: {formatCurrency(totals.gstAmount)}</span>
              </div>
            )}
          </Field>
          <Field label="Cash Paid (₹)">
            <Input
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={form.cashPaid}
              onChange={(e) => updateForm("cashPaid", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Bank Paid (₹)">
            <Input
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={form.bankPaid}
              onChange={(e) => updateForm("bankPaid", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="GPay Paid (₹)">
            <Input
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={form.gPayPaid}
              onChange={(e) => updateForm("gPayPaid", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Final Amount (₹)" className="md:col-span-2">
            <Input
              className="text-right tabular-nums font-semibold text-lg"
              readOnly
              value={formatCurrency(totals.finalAmount)}
            />
          </Field>
          <Field label="Remaining Credit (₹)" className="md:col-span-2">
            <Input className="text-right tabular-nums font-semibold" readOnly value={formatCurrency(totals.remainingCredit)} />
          </Field>
          <Field label="Remarks" className="md:col-span-2">
            <Textarea value={form.remarks} onChange={(e) => updateForm("remarks", e.target.value)} />
          </Field>
          <Field label="Book #">
            <Input
              className="text-right tabular-nums"
              type="number"
              min="1"
              step="1"
              value={form.bookNumber}
              onChange={(e) => updateForm("bookNumber", e.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label="Page # (1–50)">
            <Input
              className="text-right tabular-nums"
              type="number"
              min="1"
              max="50"
              step="1"
              value={form.pageNumber}
              onChange={(e) => updateForm("pageNumber", e.target.value)}
              placeholder="1"
            />
          </Field>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? <p className="text-sm text-success">{message}</p> : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void submit()}>
            <Save className="h-4 w-4" />
            {form.id ? "Save Changes" : "Save Sale"}
          </Button>
          {form.id && onCancelEdit ? (
            <Button variant="outline" onClick={onCancelEdit}>
              Cancel
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
