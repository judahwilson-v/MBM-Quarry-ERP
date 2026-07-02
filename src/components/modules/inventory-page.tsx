"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Boxes, Plus, ArrowDown, ArrowUp, Activity } from "lucide-react";
import { adjustInventoryStock, type getInventoryStock } from "@/lib/domain/inventory/service";

type InventoryStock = Awaited<ReturnType<typeof getInventoryStock>>[0];

export function InventoryPage({ initialStock }: { initialStock: InventoryStock[] }) {
  const [stock, setStock] = useState(initialStock);
  const [isAdjusting, setIsAdjusting] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const handleAdjust = async (materialName: string, type: 'PRODUCTION_IN' | 'SALE_OUT' | 'MANUAL_ADJUST') => {
    if (!adjustAmount || isNaN(Number(adjustAmount))) return;
    
    const amount = type === 'SALE_OUT' ? -Math.abs(Number(adjustAmount)) : Math.abs(Number(adjustAmount));
    
    try {
      await adjustInventoryStock(materialName, amount, type, adjustReason);
      // Optimistic update
      setStock(stock.map(s => {
        if (s.materialName === materialName) {
          return { ...s, quantity: s.quantity + amount };
        }
        return s;
      }));
      
      // If it's a new material being adjusted, we'd ideally refresh the full page, 
      // but Next.js Server Actions with revalidatePath will handle the refresh automatically.
      setIsAdjusting(null);
      setAdjustAmount("");
      setAdjustReason("");
    } catch (e) {
      console.error(e);
      alert("Failed to adjust stock");
    }
  };

  return (
    <div className="space-y-6 p-4 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground">Track physical stock balances of raw and crushed materials.</p>
        </div>
        <Button onClick={() => setIsAdjusting("NEW")} className="gap-2">
          <Plus className="h-4 w-4" /> Add Material
        </Button>
      </div>

      {isAdjusting === "NEW" && (
        <Card className="border-primary/50 shadow-md">
          <CardHeader>
            <CardTitle>Initialize New Material Stock</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-4">
            <Input placeholder="Material Name (e.g. 20mm)" id="new-material-name" />
            <Input type="number" placeholder="Initial Quantity" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} />
            <Input placeholder="Unit (TONS/CFT)" defaultValue="TONS" id="new-material-unit" />
            <Button onClick={() => {
              const name = (document.getElementById('new-material-name') as HTMLInputElement).value;
              const unit = (document.getElementById('new-material-unit') as HTMLInputElement).value;
              if (name) {
                adjustInventoryStock(name, Number(adjustAmount), 'MANUAL_ADJUST', 'Initial Stock', unit).then(() => {
                  window.location.reload();
                });
              }
            }}>Save</Button>
            <Button variant="ghost" onClick={() => setIsAdjusting(null)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {stock.length === 0 && !isAdjusting ? (
          <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-xl">
            <Boxes className="mx-auto h-12 w-12 opacity-20 mb-4" />
            <p>No inventory records found.</p>
            <p className="text-sm">Click "Add Material" to initialize your stock ledger.</p>
          </div>
        ) : stock.map((item) => (
          <Card key={item.id} className="overflow-hidden transition-all hover:shadow-md">
            <CardHeader className="bg-muted/20 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl font-bold">{item.materialName}</CardTitle>
                  <CardDescription>Last updated: {new Date(item.lastUpdated).toLocaleDateString()}</CardDescription>
                </div>
                <div className="p-2 rounded-full bg-primary/10 text-primary">
                  <Boxes className="h-5 w-5" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-end gap-2 mb-6">
                <span className="text-4xl font-extrabold tracking-tight">
                  {item.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className="text-muted-foreground font-medium mb-1">{item.unit}</span>
              </div>

              {isAdjusting === item.id ? (
                <div className="space-y-3 bg-accent/50 p-4 rounded-lg">
                  <div className="text-sm font-semibold mb-2">Adjust Stock</div>
                  <Input 
                    type="number" 
                    placeholder="Quantity" 
                    value={adjustAmount} 
                    onChange={e => setAdjustAmount(e.target.value)}
                    autoFocus
                  />
                  <Input 
                    placeholder="Reason/Description" 
                    value={adjustReason} 
                    onChange={e => setAdjustReason(e.target.value)}
                  />
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={() => handleAdjust(item.materialName, 'PRODUCTION_IN')}>
                      <ArrowDown className="h-4 w-4 mr-1"/> Stock In
                    </Button>
                    <Button size="sm" className="w-full bg-rose-600 hover:bg-rose-700" onClick={() => handleAdjust(item.materialName, 'SALE_OUT')}>
                      <ArrowUp className="h-4 w-4 mr-1"/> Stock Out
                    </Button>
                  </div>
                  <Button size="sm" variant="ghost" className="w-full mt-1" onClick={() => setIsAdjusting(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Button variant="outline" className="w-full" onClick={() => setIsAdjusting(item.id)}>
                    Adjust Balance
                  </Button>
                  
                  {item.transactions.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-3">
                        <Activity className="h-3 w-3" /> Recent Activity
                      </div>
                      <div className="space-y-2">
                        {item.transactions.slice(0, 3).map(tx => (
                          <div key={tx.id} className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground truncate max-w-[140px]" title={tx.description || tx.type}>
                              {tx.description || tx.type.replace('_', ' ')}
                            </span>
                            <span className={tx.quantityChange > 0 ? "text-emerald-500 font-medium" : "text-rose-500 font-medium"}>
                              {tx.quantityChange > 0 ? "+" : ""}{tx.quantityChange}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
