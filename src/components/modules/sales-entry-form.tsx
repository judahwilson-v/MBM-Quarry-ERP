"use client";
import { usePrompt } from "@/components/ui/prompt-provider";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

import { listMaterials } from "@/app/actions/materials";
import { listVehicles } from "@/app/actions/vehicles";
import { saveSale, getLastBookPage, checkDuplicateSaleBookNumber } from "@/app/actions/sales";
import { deriveSalesEngine } from "@/lib/sales-engine";
import { verifyEditPassword } from "@/app/actions/auth";
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { promptPassword, confirmAction } = usePrompt();

  const loadMasters = useCallback(async () => {
    try {
      const [vehicleRows, materialRows] = await Promise.all([listVehicles(), listMaterials()]);
      setVehicles(vehicleRows as VehicleRow[]);
      setMaterials((materialRows as MaterialRow[]).filter(
        (row) => row && !HIDDEN_MATERIALS.has(row?.materialName ?? "")
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
    const matchedMaterial = materials.find((material) => material?.materialName === editingSale?.materialName);
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
      if (nextPage > 100) {
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
    let defaultQty = null;
    if (vehicle?.companyBodyQty && vehicle.companyBodyQty > 0) {
      defaultQty = vehicle.companyBodyQty;
    } else if (vehicle?.extraBodyQty && vehicle.extraBodyQty > 0) {
      defaultQty = vehicle.extraBodyQty;
    }
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
    if (isSubmitting) return;
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      if (!form.materialId) throw new Error("Material is required.");
      if (!form.qty || Number(form.qty) <= 0) throw new Error("Quantity must be greater than 0.");
      if (!form.ratePerCft || Number(form.ratePerCft) < 0) throw new Error("Rate must be a valid number.");

      // Check for duplicate book/page number before saving
      if (form.bookNumber && form.pageNumber) {
        const isDuplicate = await checkDuplicateSaleBookNumber(
          Number(form.bookNumber),
          Number(form.pageNumber),
          form.id
        );
        
        if (isDuplicate) {
          const proceed = await confirmAction(
            `Warning: Book Number ${form.bookNumber} / Page ${form.pageNumber} already exists in the database!\n\nAre you sure you want to proceed and save a duplicate or overwrite?`
          );
          if (!proceed) {
             setIsSubmitting(false);
             return;
          }
        }
      }

      if (form.id) {
        const password = await promptPassword("Enter edit password:");
        if (!password || !(await verifyEditPassword(password))) {
          throw new Error("Edit password is invalid.");
        }
      }
      const res = await saveSale({
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
      if (res.success) {
        setMessage(form.id ? "Sale updated." : "Sale saved.");
        setForm(blankSale());
        onSaved?.();
      } else {
        setError(res.error || "Failed to save sale.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save sale.");
    } finally {
      setIsSubmitting(false);
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
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4 items-start">
          {/* Row 1: Document & Vehicle Info */}
          <Field label="Date" htmlFor="saleDate">
            <Input id="saleDate" type="date" value={form.saleDate} onChange={(e) => updateForm("saleDate", e.target.value)} />
          </Field>
          <Field label="Book #" htmlFor="bookNumber">
            <Input
              id="bookNumber"
              className="text-right tabular-nums"
              type="number"
              min="1"
              step="1"
              value={form.bookNumber}
              onChange={(e) => updateForm("bookNumber", e.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label="Page # (1–100)" htmlFor="pageNumber">
            <Input
              id="pageNumber"
              className="text-right tabular-nums"
              type="number"
              min="1"
              max="100"
              step="1"
              value={form.pageNumber}
              onChange={(e) => updateForm("pageNumber", e.target.value)}
              placeholder="1"
            />
          </Field>
          <Field label="Vehicle Number" htmlFor="saleVehicleNumber">
            <SearchableSelect
              id="saleVehicleNumber"
              aria-label="Vehicle Number"
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

          {/* Row 2: Customer, Material & Rates */}
          <Field label="Party Name" htmlFor="partyName">
            <Input id="partyName" value={form.partyName} onChange={(e) => updateForm("partyName", e.target.value)} placeholder="Customer name" />
          </Field>
          <Field label="Material" htmlFor="saleMaterial">
            <SearchableSelect
              id="saleMaterial"
              aria-label="Material"
              value={form.materialId}
              placeholder="Select material"
              options={materials.map((material) => ({
                value: material?.id ?? "",
                label: material?.materialName ?? "",
                description: `₹${material?.ratePerCft ?? 0}/CFT`,
              }))}
              onChange={selectMaterial}
            />
          </Field>
          <Field label="Rate (₹/CFT)" htmlFor="ratePerCft">
            <Input
              id="ratePerCft"
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              value={form.ratePerCft}
              onChange={(e) => updateForm("ratePerCft", e.target.value)}
              placeholder="0"
            />
          </Field>
          <div className="space-y-2">
            <Field label="Qty (CFT)" htmlFor="qty">
              <Input
                id="qty"
                className="text-right tabular-nums"
                type="number"
                step="0.001"
                value={form.qty}
                onChange={(e) => updateForm("qty", e.target.value)}
              />
            </Field>
            {(() => {
              const vehicle = vehicles.find(v => v.id === form.vehicleId);
              if (!vehicle || (!vehicle.companyBodyQty && !vehicle.extraBodyQty)) return null;
              
              return (
                <div className="flex flex-wrap gap-2 mt-2">
                  {vehicle.companyBodyQty ? (
                    <button 
                      type="button" 
                      onClick={() => {
                        updateForm("qty", String(vehicle.companyBodyQty));
                        updateForm("quantityReason", "");
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${Number(form.qty) === vehicle.companyBodyQty ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'}`}
                    >
                      🚛 Company: {vehicle.companyBodyQty} CFT
                    </button>
                  ) : null}
                  {vehicle.extraBodyQty ? (
                    <button 
                      type="button" 
                      onClick={() => {
                        updateForm("qty", String(vehicle.extraBodyQty));
                        updateForm("quantityReason", "");
                      }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${Number(form.qty) === vehicle.extraBodyQty ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'}`}
                    >
                      📦 Extra: {vehicle.extraBodyQty} CFT
                    </button>
                  ) : null}
                </div>
              );
            })()}
          </div>

          {/* Quantity Reason if changed */}
          {(() => {
            const vehicle = vehicles.find(v => v.id === form.vehicleId);
            if (!vehicle) return null;
            const companyQty = vehicle.companyBodyQty ?? null;
            const extraQty = vehicle.extraBodyQty ?? null;
            
            const hasCompany = companyQty !== null && companyQty > 0;
            const hasExtra = extraQty !== null && extraQty > 0;
            const hasDefault = hasCompany || hasExtra;
            
            const currentQty = Number(form.qty);
            const isCompany = hasCompany && currentQty === companyQty;
            const isExtra = hasExtra && currentQty === extraQty;
            
            const isChanged = hasDefault && currentQty > 0 && !isCompany && !isExtra;
            if (!isChanged) return null;
            return (
              <Field label="Quantity Reason (Required)" className="xl:col-span-4" htmlFor="quantityReason">
                <Input 
                  id="quantityReason"
                  value={form.quantityReason} 
                  onChange={(e) => updateForm("quantityReason", e.target.value)} 
                  placeholder="Why did qty change?"
                />
              </Field>
            );
          })()}

          {/* Row 3: Discount & GST */}
          <Field label="Discount Type" htmlFor="discountType">
            <select
              id="discountType"
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-[var(--shadow-card)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-accent"
              value={form.discountType}
              onChange={(event) => updateForm("discountType", event.target.value as "percentage" | "fixed")}
            >
              <option value="fixed">Fixed Amount</option>
              <option value="percentage">Percentage</option>
            </select>
          </Field>
          <Field label={form.discountType === "percentage" ? "Discount (%)" : "Discount Amount"} htmlFor="discountValue">
            <Input
              id="discountValue"
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              value={form.discountValue}
              onChange={(e) => updateForm("discountValue", e.target.value)}
            />
          </Field>
          <Field label="GST (5%)" className="xl:col-span-2" htmlFor="saleGstEnabled">
            <div className="flex items-center gap-3 h-10">
              <label className="relative inline-flex items-center cursor-pointer" htmlFor="saleGstEnabled">
                <input
                  type="checkbox"
                  id="saleGstEnabled"
                  aria-label="Enable 5% GST"
                  className="sr-only peer"
                  checked={form.gstEnabled}
                  onChange={(e) => updateForm("gstEnabled", e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                <span className="ms-3 text-sm font-medium">{form.gstEnabled ? "GST Enabled" : "No GST"}</span>
              </label>
              {form.gstEnabled && totals.gstAmount > 0 && (
                <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 font-medium dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/50">
                  <span>SGST: {formatCurrency(totals.sgst)}</span>
                  <span>•</span>
                  <span>CGST: {formatCurrency(totals.cgst)}</span>
                  <span>•</span>
                  <span className="font-bold text-red-800">Total: {formatCurrency(totals.gstAmount)}</span>
                </div>
              )}
            </div>
          </Field>

          {/* Row 4: Payments & Credit (4 Columns Aligned) */}
          <Field label="Cash Paid (₹)" htmlFor="cashPaid">
            <Input
              id="cashPaid"
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={form.cashPaid}
              onChange={(e) => updateForm("cashPaid", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Bank Paid (₹)" htmlFor="bankPaid">
            <Input
              id="bankPaid"
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={form.bankPaid}
              onChange={(e) => updateForm("bankPaid", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="GPay Paid (₹)" htmlFor="gPayPaid">
            <Input
              id="gPayPaid"
              className="text-right tabular-nums"
              type="number"
              step="0.01"
              min="0"
              value={form.gPayPaid}
              onChange={(e) => updateForm("gPayPaid", e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Remaining Credit (₹)" htmlFor="saleRemainingCredit">
            <Input id="saleRemainingCredit" className="text-right tabular-nums font-semibold text-amber-500 bg-amber-500/5 border-amber-500/20" readOnly value={formatCurrency(totals.remainingCredit)} />
          </Field>

          {/* Row 5: Summary & Remarks */}
          <div className="xl:col-span-2 flex flex-col gap-2">
            <Field label="Final Amount (₹)" htmlFor="finalAmount">
              <Input
                id="finalAmount"
                className="text-right tabular-nums font-bold text-xl text-emerald-500 bg-emerald-500/5 border-emerald-500/20 h-10"
                readOnly
                value={formatCurrency(totals.finalAmount)}
              />
            </Field>
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2 bg-green-50/50 hover:bg-green-100/50 text-green-700 border-green-200" onClick={() => setForm(f => ({ ...f, cashPaid: String(totals.finalAmount), bankPaid: "0", gPayPaid: "0" }))}>💵 Full Cash</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2 bg-blue-50/50 hover:bg-blue-100/50 text-blue-700 border-blue-200" onClick={() => setForm(f => ({ ...f, cashPaid: "0", bankPaid: "0", gPayPaid: String(totals.finalAmount) }))}>📱 Full GPay</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2 bg-purple-50/50 hover:bg-purple-100/50 text-purple-700 border-purple-200" onClick={() => setForm(f => ({ ...f, cashPaid: "0", bankPaid: String(totals.finalAmount), gPayPaid: "0" }))}>🏦 Full Bank</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2 bg-amber-50/50 hover:bg-amber-100/50 text-amber-700 border-amber-200" onClick={() => setForm(f => ({ ...f, cashPaid: "0", bankPaid: "0", gPayPaid: "0" }))}>📝 Full Credit</Button>
            </div>
          </div>
          <Field label="Remarks" className="xl:col-span-2" htmlFor="remarks">
            <Input
              id="remarks"
              value={form.remarks}
              onChange={(e) => updateForm("remarks", e.target.value)}
              placeholder="Optional notes or remarks"
              className="h-10"
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
