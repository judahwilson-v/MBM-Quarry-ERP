"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { FileText, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { currentTimeInputValue, formatCurrency, todayInputValue } from "@/lib/utils";

type Master = Record<string, any>;
type PaymentType = "CASH" | "BANK" | "GPAY" | "CREDIT" | "MIXED";
type DiscountType = "NONE" | "PERCENTAGE" | "FIXED_AMOUNT";

type SaleForm = {
  date: string;
  time: string;
  vehicleId: string;
  vehicleNumber: string;
  partyId: string;
  partyName: string;
  driverId: string;
  materialId: string;
  qty: string;
  rate: string;
  discountType: DiscountType;
  discountValue: string;
  paymentType: PaymentType;
  cashAmount: string;
  bankAmount: string;
  gpayAmount: string;
  creditAmount: string;
  remarks: string;
  setAsNewDefault: boolean;
};

function blankSale(): SaleForm {
  return {
    date: todayInputValue(),
    time: currentTimeInputValue(),
    vehicleId: "",
    vehicleNumber: "",
    partyId: "",
    partyName: "",
    driverId: "",
    materialId: "",
    qty: "",
    rate: "",
    discountType: "NONE",
    discountValue: "",
    paymentType: "CASH",
    cashAmount: "0.00",
    bankAmount: "0.00",
    gpayAmount: "0.00",
    creditAmount: "0.00",
    remarks: "",
    setAsNewDefault: false,
  };
}

export function SalesEntryPage() {
  const { data: session } = useSession();
  const [form, setForm] = useState<SaleForm>(() => blankSale());
  const [vehicles, setVehicles] = useState<Master[]>([]);
  const [parties, setParties] = useState<Master[]>([]);
  const [materials, setMaterials] = useState<Master[]>([]);
  const [drivers, setDrivers] = useState<Master[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [savedSale, setSavedSale] = useState<any>(null);

  const selectedVehicle = vehicles.find((row) => row.id === form.vehicleId);

  const grossAmount = useMemo(() => {
    const qty = Number(form.qty || 0);
    const rate = Number(form.rate || 0);
    return Number.isFinite(qty * rate) ? qty * rate : 0;
  }, [form.qty, form.rate]);

  const discountAmount = useMemo(() => {
    const value = Number(form.discountValue || 0);
    if (form.discountType === "PERCENTAGE") return Math.min(grossAmount, (grossAmount * value) / 100);
    if (form.discountType === "FIXED_AMOUNT") return Math.min(grossAmount, value);
    return 0;
  }, [form.discountType, form.discountValue, grossAmount]);

  const netAmount = Math.max(grossAmount - discountAmount, 0);
  const paidTotal = ["cashAmount", "bankAmount", "gpayAmount", "creditAmount"].reduce(
    (sum, key) => sum + Number(form[key as keyof SaleForm] || 0),
    0,
  );
  const remaining = Number((netAmount - paidTotal).toFixed(2));

  const loadMasters = useCallback(async () => {
    async function load(key: "vehicles" | "parties" | "materials" | "drivers") {
      const body = await fetch(`/api/v1/${key}?pageSize=500`).then((response) => response.json());
      return body.data ?? [];
    }
    const [vehicleRows, partyRows, materialRows, driverRows] = await Promise.all([
      load("vehicles"),
      load("parties"),
      load("materials"),
      load("drivers"),
    ]);
    setVehicles(vehicleRows as Master[]);
    setParties(partyRows as Master[]);
    setMaterials(materialRows as Master[]);
    setDrivers(driverRows as Master[]);
  }, []);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    if (form.paymentType === "MIXED") return;
    const amount = netAmount.toFixed(2);
    setForm((current) => ({
      ...current,
      cashAmount: current.paymentType === "CASH" ? amount : "0.00",
      bankAmount: current.paymentType === "BANK" ? amount : "0.00",
      gpayAmount: current.paymentType === "GPAY" ? amount : "0.00",
      creditAmount: current.paymentType === "CREDIT" ? amount : "0.00",
    }));
  }, [form.paymentType, netAmount]);

  function updateForm<K extends keyof SaleForm>(key: K, value: SaleForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectVehicle(vehicleId: string) {
    const vehicle = vehicles.find((row) => row.id === vehicleId);
    setForm((current) => ({
      ...current,
      vehicleId,
      vehicleNumber: vehicle?.vehicleNumber ?? current.vehicleNumber,
      partyId: vehicle?.partyId ?? current.partyId,
      partyName: vehicle?.party?.name ?? current.partyName,
      qty: vehicle?.defaultQty ? String(vehicle.defaultQty) : current.qty,
    }));
    setError("");
  }

  function selectParty(partyId: string) {
    const party = parties.find((row) => row.id === partyId);
    setForm((current) => ({
      ...current,
      partyId,
      partyName: party?.name ?? current.partyName,
    }));
  }

  function selectMaterial(materialId: string) {
    const material = materials.find((row) => row.id === materialId);
    setForm((current) => ({
      ...current,
      materialId,
      rate: material?.currentRate ? String(material.currentRate) : current.rate,
    }));
  }

  async function submit() {
    setError("");
    setMessage("");
    if (!navigator.onLine) {
      setError("Internet connection is required. Sales are saved directly to the production database.");
      return;
    }
    if (!form.partyId && !form.partyName.trim()) {
      setError("Party Name is required.");
      return;
    }
    if (!form.materialId) {
      setError("Material is required.");
      return;
    }
    if (Number(form.qty) <= 0) {
      setError("Quantity must be greater than 0.");
      return;
    }
    if (Number(form.rate) <= 0) {
      setError("Rate must be greater than 0.");
      return;
    }
    if (discountAmount > grossAmount) {
      setError("Discount cannot exceed the gross amount.");
      return;
    }
    if (Math.abs(remaining) > 0.001) {
      setError(`Payment total ${formatCurrency(paidTotal)} does not match Net Amount ${formatCurrency(netAmount)}.`);
      return;
    }

    const payload = {
      date: form.date,
      time: form.time,
      vehicleId: form.vehicleId || null,
      vehicleNumber: form.vehicleNumber,
      partyId: form.partyId || null,
      partyName: form.partyName,
      driverId: form.driverId || null,
      materialId: form.materialId,
      qty: form.qty,
      rate: form.rate,
      grossAmount: grossAmount.toFixed(2),
      discountType: form.discountType === "NONE" ? null : form.discountType,
      discountValue: form.discountType === "NONE" ? null : form.discountValue || "0",
      discountAmount: discountAmount.toFixed(2),
      netAmount: netAmount.toFixed(2),
      paymentType: form.paymentType,
      cashAmount: Number(form.cashAmount || 0).toFixed(2),
      bankAmount: Number(form.bankAmount || 0).toFixed(2),
      gpayAmount: Number(form.gpayAmount || 0).toFixed(2),
      creditAmount: Number(form.creditAmount || 0).toFixed(2),
      remarks: form.remarks,
      operatorName: session?.user?.name,
      setAsNewDefault: form.setAsNewDefault,
    };

    const response = await fetch("/api/v1/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Save failed.");
      return;
    }
    setSavedSale(body);
    setMessage("Sale saved and dispatch slip generated.");
    setForm(blankSale());
  }

  const driverOptions = drivers
    .filter((driver) => !form.vehicleId || driver.vehicleId === form.vehicleId)
    .map((driver) => ({ value: driver.id, label: driver.name, description: driver.mobile }));
  const salesMaterialCodes = new Set(["6MM", "20MM", "40MM", "MSAND", "PSAND", "DUST", "GSB", "PS"]);
  const materialOptions = materials
    .filter((material) => salesMaterialCodes.has(String(material.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")))
    .map((material) => ({
      value: material.id,
      label: material.name,
      description: `${material.code} - ${formatCurrency(material.currentRate)}/CFT`,
    }));

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">New Sale</h1>
        <p className="text-sm text-muted-foreground">CFT sale entry with discount, split payments, ledger, and dispatch slip generation.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sales Entry</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(event) => updateForm("date", event.target.value)} />
            </Field>
            <Field label="Time">
              <Input type="time" value={form.time} onChange={(event) => updateForm("time", event.target.value)} />
            </Field>
            <Field label="Vehicle Number">
              <SearchableSelect
                value={form.vehicleId}
                customValue={form.vehicleNumber}
                allowCustom
                placeholder="Type to search vehicle"
                options={vehicles.map((vehicle) => ({
                  value: vehicle.id,
                  label: vehicle.vehicleNumber,
                  description: vehicle.party?.name || vehicle.ownerName,
                }))}
                onChange={selectVehicle}
                onCustomValueChange={(vehicleNumber) => setForm((current) => ({ ...current, vehicleNumber, vehicleId: vehicleNumber === current.vehicleNumber ? current.vehicleId : "" }))}
              />
            </Field>
            <Field label="Party Name">
              <SearchableSelect
                value={form.partyId}
                customValue={form.partyName}
                allowCustom
                placeholder="Search party"
                options={parties.map((party) => ({ value: party.id, label: party.name, description: party.phone }))}
                onChange={selectParty}
                onCustomValueChange={(partyName) => setForm((current) => ({ ...current, partyName, partyId: partyName === current.partyName ? current.partyId : "" }))}
              />
            </Field>
            <Field label="Driver">
              <SearchableSelect value={form.driverId} placeholder="Optional driver" options={driverOptions} onChange={(value) => updateForm("driverId", value)} />
            </Field>
            <Field label="Material">
              <SearchableSelect
                value={form.materialId}
                placeholder="Select material"
                options={materialOptions}
                onChange={selectMaterial}
              />
            </Field>
            <Field label="Quantity (CFT)">
              <Input className="text-right tabular-nums" type="number" step="0.001" value={form.qty} onChange={(event) => updateForm("qty", event.target.value)} />
            </Field>
            <Field label="Rate (₹/CFT)">
              <Input className="text-right tabular-nums" type="number" step="0.01" value={form.rate} onChange={(event) => updateForm("rate", event.target.value)} />
            </Field>
          </div>

          {selectedVehicle ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant={selectedVehicle.companyBody ? "success" : "secondary"}>Company Body {selectedVehicle.companyBody ? "Yes" : "No"}</Badge>
              <Badge variant={selectedVehicle.extraBody ? "success" : "secondary"}>Extra {selectedVehicle.extraBody ? "Yes" : "No"}</Badge>
              <Badge variant={selectedVehicle.isPickup ? "success" : "secondary"}>Pickup {selectedVehicle.isPickup ? "Yes" : "No"}</Badge>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryBox label="Gross Amount" value={formatCurrency(grossAmount)} />
            <Field label="Discount Type">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.discountType} onChange={(event) => updateForm("discountType", event.target.value as DiscountType)}>
                <option value="NONE">None</option>
                <option value="PERCENTAGE">%</option>
                <option value="FIXED_AMOUNT">₹</option>
              </select>
            </Field>
            <Field label="Discount Value">
              <Input className="text-right tabular-nums" type="number" step="0.01" value={form.discountValue} disabled={form.discountType === "NONE"} onChange={(event) => updateForm("discountValue", event.target.value)} />
            </Field>
            <SummaryBox label="Net Amount" value={formatCurrency(netAmount)} />
          </div>

          <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
            <Field label="Payment Type">
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.paymentType} onChange={(event) => updateForm("paymentType", event.target.value as PaymentType)}>
                {["CASH", "BANK", "GPAY", "CREDIT", "MIXED"].map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 md:grid-cols-5">
              {(["cashAmount", "bankAmount", "gpayAmount", "creditAmount"] as const).map((key) => (
                <Field key={key} label={key === "cashAmount" ? "Cash" : key === "bankAmount" ? "Bank" : key === "gpayAmount" ? "GPay" : "Credit"}>
                  <Input
                    className="text-right tabular-nums"
                    type="number"
                    step="0.01"
                    value={form[key]}
                    readOnly={form.paymentType !== "MIXED"}
                    onChange={(event) => updateForm(key, event.target.value)}
                  />
                </Field>
              ))}
              <SummaryBox label="Remaining" value={formatCurrency(remaining)} tone={Math.abs(remaining) > 0.001 ? "danger" : "ok"} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Field label="Remarks">
              <Textarea value={form.remarks} onChange={(event) => updateForm("remarks", event.target.value)} />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={form.setAsNewDefault} onChange={(event) => updateForm("setAsNewDefault", event.target.checked)} />
              Set as vehicle default qty
            </label>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void submit()}>
              <Save className="h-4 w-4" />
              Save Sale
            </Button>
            <Button variant="outline" asChild>
              <Link href="/sales">Sales Table</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {savedSale?.dispatchSlip ? (
        <Card className="border-success/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dispatch Slip Ready
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-medium">{savedSale.dispatchSlip.slipNumber}</div>
              <div className="text-muted-foreground">
                {savedSale.vehicle?.vehicleNumber ?? "No vehicle"} - {savedSale.party?.name} - {savedSale.material?.name}
              </div>
            </div>
            <Button asChild>
              <Link href={`/dispatch/${savedSale.dispatchSlip.id}`}>Print / PDF / WhatsApp</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryBox({ label, value, tone }: { label: string; value: string; tone?: "danger" | "ok" }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={tone === "danger" ? "mt-1 font-semibold text-red-700" : tone === "ok" ? "mt-1 font-semibold text-green-700" : "mt-1 font-semibold"}>
        {value}
      </div>
    </div>
  );
}
