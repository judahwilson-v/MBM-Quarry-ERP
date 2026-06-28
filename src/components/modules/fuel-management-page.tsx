"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Search, Check, Fuel } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listFuelPurchases, saveFuelPurchase, listVehicles, deleteFuelPurchase } from "@/lib/offline-actions";
import { formatCurrency } from "@/lib/utils";
import { SearchableSelect } from "@/components/ui/searchable-select";

type FuelPurchaseRow = any;
type VehicleRow = any;

function todayInputValue() {
  const offset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - offset).toISOString().slice(0, 10);
}

function dateInput(value: string) {
  if (!value) return todayInputValue();
  return value.split("T")[0];
}

function blankForm() {
  return {
    id: "",
    date: todayInputValue(),
    fuelType: "DIESEL",
    pricePerLitre: "",
    qtyLitre: "",
    amount: "",
    paidAmount: "",
    isCan: false,
    vehicleId: "",
    vehicleNumber: "",
  };
}

export function FuelManagementPage() {
  const [data, setData] = useState<FuelPurchaseRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm());
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [fuel, vlist] = await Promise.all([listFuelPurchases(), listVehicles()]);
      setData(fuel);
      setVehicles(vlist);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function edit(row: FuelPurchaseRow) {
    setForm({
      id: row.id,
      date: dateInput(row.date),
      fuelType: row.fuelType,
      pricePerLitre: row.pricePerLitre ? String(row.pricePerLitre) : "",
      qtyLitre: row.qtyLitre ? String(row.qtyLitre) : "",
      amount: String(row.amount),
      paidAmount: String(row.paidAmount),
      isCan: row.isCan,
      vehicleId: row.vehicleId || "",
      vehicleNumber: row.vehicleNumber || "",
    });
    setIsEditing(true);
    setMessage("");
    setError("");
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      if (!form.amount) throw new Error("Amount is required");
      
      await saveFuelPurchase(form);
      setMessage("Fuel purchase saved successfully!");
      setForm(blankForm());
      setIsEditing(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Are you sure you want to delete this fuel record? This action cannot be undone.")) return;
    try {
      await deleteFuelPurchase(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const filtered = data.filter(row => {
    const q = search.toLowerCase();
    if (row.vehicleNumber?.toLowerCase().includes(q)) return true;
    if (row.fuelType.toLowerCase().includes(q)) return true;
    if (row.isCan && "can".includes(q)) return true;
    return false;
  });

  return (
    <div className="space-y-6 p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fuel Management</h1>
          <p className="text-muted-foreground">Track diesel/petrol purchases for vehicles and CANs.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>{isEditing ? "Edit Fuel Purchase" : "New Fuel Purchase"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="rounded-md bg-red-500/15 p-3 text-sm text-red-500">{error}</div>}
            {message && <div className="rounded-md bg-emerald-500/15 p-3 text-sm text-emerald-500">{message}</div>}

            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fuel Type</label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.fuelType} onChange={e => setForm({ ...form, fuelType: e.target.value })}>
                <option value="DIESEL">Diesel</option>
                <option value="PETROL">Petrol</option>
              </select>
            </div>

            <div className="flex items-center space-x-2 pt-2 pb-2">
              <input type="checkbox" id="isCan" checked={form.isCan} onChange={e => setForm({ ...form, isCan: e.target.checked })} className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary" />
              <label htmlFor="isCan" className="text-sm font-medium">Purchased in CAN?</label>
            </div>

            {!form.isCan && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Vehicle</label>
                <SearchableSelect
                  value={form.vehicleId}
                  customValue={form.vehicleNumber}
                  options={vehicles.map(v => ({ value: v.id, label: v.vehicleNumber }))}
                  onChange={(val) => {
                    const vehicle = vehicles.find(v => v.id === val);
                    setForm({ ...form, vehicleId: val, vehicleNumber: vehicle?.vehicleNumber || "" });
                  }}
                  onCustomValueChange={(custom) => setForm({ ...form, vehicleId: "", vehicleNumber: custom })}
                  allowCustom
                  placeholder="Select or enter vehicle..."
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Price / Litre (Opt)</label>
                <Input type="number" step="0.01" value={form.pricePerLitre} onChange={e => setForm({ ...form, pricePerLitre: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Quantity (L) (Opt)</label>
                <Input type="number" step="0.01" value={form.qtyLitre} onChange={e => setForm({ ...form, qtyLitre: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Total Amount (₹) *</label>
              <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount Paid (₹)</label>
              <Input type="number" value={form.paidAmount} onChange={e => setForm({ ...form, paidAmount: e.target.value })} />
              <p className="text-xs text-muted-foreground">Leave blank if fully on credit. Entered amount hits DayBook Expense.</p>
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={submit} className="flex-1">
                <Check className="mr-2 h-4 w-4" /> {isEditing ? "Update" : "Save"}
              </Button>
              {isEditing && (
                <Button variant="outline" onClick={() => { setIsEditing(false); setForm(blankForm()); }}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Recent Fuel Purchases</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search vehicle or CAN..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground">
                      <th className="p-4">Date</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Target</th>
                      <th className="p-4 text-right">Qty/Price</th>
                      <th className="p-4 text-right">Amount</th>
                      <th className="p-4 text-right">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="p-4 text-center">Loading...</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No records found.</td></tr>
                    ) : (
                      filtered.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/50">
                          <td className="p-4">{format(new Date(row.date), "dd/MM/yyyy")}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${row.fuelType === 'PETROL' ? 'bg-orange-100 text-orange-700' : 'bg-zinc-100 text-zinc-700'}`}>
                              {row.fuelType}
                            </span>
                          </td>
                          <td className="p-4 font-medium">
                            {row.isCan ? (
                              <span className="flex items-center text-blue-600"><Fuel className="mr-1 h-3 w-3" /> CAN</span>
                            ) : (
                              row.vehicleNumber || "Unknown"
                            )}
                          </td>
                          <td className="p-4 text-right tabular-nums">
                            {row.qtyLitre ? <>{row.qtyLitre}L<br/><span className="text-xs text-muted-foreground">@ ₹{row.pricePerLitre}</span></> : "-"}
                          </td>
                          <td className="p-4 text-right tabular-nums font-medium text-rose-600">
                            {formatCurrency(row.amount)}
                          </td>
                          <td className="p-4 text-right tabular-nums">
                            {row.paidAmount >= row.amount ? (
                              <span className="text-emerald-600 font-medium">Paid</span>
                            ) : row.paidAmount > 0 ? (
                              <span className="text-amber-600 font-medium">Partial</span>
                            ) : (
                              <span className="text-rose-600 font-medium">Credit</span>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <Button variant="ghost" size="sm" onClick={() => edit(row)}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => remove(row.id)} className="text-red-500 hover:text-red-600">Del</Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
