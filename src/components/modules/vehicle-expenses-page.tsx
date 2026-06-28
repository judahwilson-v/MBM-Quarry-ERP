"use client";

import { useEffect, useState, useMemo } from "react";
import { format } from "date-fns";
import { Truck, Search, Receipt, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listVehicles, listExpenses } from "@/lib/offline-actions";
import { formatCurrency } from "@/lib/utils";

type VehicleRow = any;
type ExpenseRow = any;

export function VehicleExpensesPage() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [v, e] = await Promise.all([listVehicles(), listExpenses()]);
      setVehicles(v);
      setExpenses(e.filter((exp: any) => exp.vehicleId));
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const vehicleStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const v of vehicles) stats[v.id] = 0;
    for (const e of expenses) {
      if (e.vehicleId && stats[e.vehicleId] !== undefined) {
        stats[e.vehicleId] += Number(e.amount);
      }
    }
    return stats;
  }, [vehicles, expenses]);

  const filteredVehicles = vehicles.filter(v => 
    v.vehicleNumber.toLowerCase().includes(search.toLowerCase()) || 
    (v.partyName && v.partyName.toLowerCase().includes(search.toLowerCase()))
  );

  const selectedExpenses = useMemo(() => {
    if (!selectedVehicle) return [];
    return expenses.filter(e => e.vehicleId === selectedVehicle.id).sort((a, b) => new Date(b.expenseDate).getTime() - new Date(a.expenseDate).getTime());
  }, [expenses, selectedVehicle]);

  if (selectedVehicle) {
    return (
      <div className="space-y-6 p-4 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="outline" size="icon" onClick={() => setSelectedVehicle(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{selectedVehicle.vehicleNumber}</h1>
            <p className="text-muted-foreground">{selectedVehicle.partyName || "Owned Vehicle"} • Total Expenses: <span className="font-medium text-foreground">{formatCurrency(vehicleStats[selectedVehicle.id] || 0)}</span></p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Expense History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground">
                      <th className="p-4">Date</th>
                      <th className="p-4">Category</th>
                      <th className="p-4">Description</th>
                      <th className="p-4">Payment Mode</th>
                      <th className="p-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedExpenses.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No expenses recorded for this vehicle.</td></tr>
                    ) : (
                      selectedExpenses.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/50">
                          <td className="p-4">{format(new Date(row.expenseDate), "dd/MM/yyyy")}</td>
                          <td className="p-4">
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-zinc-100 text-zinc-700">
                              {row.expenseType}
                            </span>
                          </td>
                          <td className="p-4 text-muted-foreground">{row.description || "-"}</td>
                          <td className="p-4 text-muted-foreground">{row.paymentMode}</td>
                          <td className="p-4 text-right font-medium tabular-nums text-rose-600">
                            {formatCurrency(row.amount)}
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
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vehicle Expenses</h1>
          <p className="text-muted-foreground">Track repairs, maintenance, and running costs per vehicle.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Vehicle Directory</CardTitle>
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search vehicle..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pt-4">
            {loading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : filteredVehicles.length === 0 ? (
              <p className="text-muted-foreground">No vehicles found.</p>
            ) : (
              filteredVehicles.map(v => (
                <div 
                  key={v.id} 
                  onClick={() => setSelectedVehicle(v)}
                  className="group cursor-pointer rounded-lg border bg-card p-4 transition-all hover:border-primary hover:shadow-md"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <Truck className="h-5 w-5" />
                    </div>
                    <Receipt className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <h3 className="font-semibold text-lg">{v.vehicleNumber}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{v.partyName || "Owned Vehicle"}</p>
                  
                  <div className="pt-3 border-t flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Total Expenses</span>
                    <span className="font-medium text-rose-600">{formatCurrency(vehicleStats[v.id] || 0)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
