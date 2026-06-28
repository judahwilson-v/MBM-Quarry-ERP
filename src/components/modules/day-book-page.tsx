"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatCurrency, todayInputValue } from "@/lib/utils";
import { fetchDayBookData, saveCashTransfer, logDayBookAudit } from "@/lib/daybook-actions";
import { saveDayBookOpeningBalances } from "@/lib/offline-actions";
import { usePrompt } from "@/components/ui/prompt-provider";

export function DayBookPage() {
  const [date, setDate] = useState<string>(todayInputValue());
  const [userName, setUserName] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { promptPassword, confirmAction } = usePrompt();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDayBookData(date);
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const savedName = localStorage.getItem("mbm_user_name") || "";
    setUserName(savedName);
    void loadData();
  }, [loadData]);

  const handleNameChange = (val: string) => {
    setUserName(val);
    localStorage.setItem("mbm_user_name", val);
  };

  const handleOpeningBalanceEdit = async (type: "cash" | "bank") => {
    if (!userName) {
      alert("Please enter your name in the User field to track edits.");
      return;
    }
    const currentVal = type === "cash" ? data.openingCash : data.openingBank;
    const newVal = await promptPassword(`Enter new Opening ${type === "cash" ? "Cash" : "Bank"} Balance:`);
    if (!newVal || isNaN(Number(newVal))) return;

    const numVal = Number(newVal);
    if (numVal === currentVal) return;

    const confirmed = await confirmAction(`Update opening ${type} from ${formatCurrency(currentVal)} to ${formatCurrency(numVal)}?`);
    if (!confirmed) return;

    try {
      const payload = {
        businessDate: date,
        openingCashBalance: type === "cash" ? numVal : data.openingCash,
        openingBankBalance: type === "bank" ? numVal : data.openingBank,
      };
      
      await saveDayBookOpeningBalances(payload);
      
      await logDayBookAudit({
        userName,
        date,
        time: new Date().toLocaleTimeString(),
        oldValue: currentVal,
        newValue: numVal,
        action: `Changed Opening ${type === "cash" ? "Cash" : "Bank"}`,
        module: "DayBook"
      });

      await loadData();
    } catch {
      alert("Failed to update opening balance.");
    }
  };

  const [transferForm, setTransferForm] = useState({ type: "CASH_TO_BANK", amount: "", remarks: "" });

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName) {
      alert("Please enter your name in the User field to track transfers.");
      return;
    }
    if (!transferForm.amount || isNaN(Number(transferForm.amount)) || Number(transferForm.amount) <= 0) return;
    
    try {
      await saveCashTransfer({
        type: transferForm.type,
        amount: Number(transferForm.amount),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        date,
        remarks: transferForm.remarks,
        userName
      });
      setTransferForm({ type: "CASH_TO_BANK", amount: "", remarks: "" });
      await loadData();
    } catch {
      alert("Failed to save transfer.");
    }
  };

  if (loading && !data) return <div className="p-6">Loading Day Book...</div>;

  return (
    <div className="space-y-6 p-4 lg:p-6 print:p-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Day Book</h1>
          <p className="text-muted-foreground">Daily financial summary and transfers.</p>
        </div>
        <div className="flex gap-4 items-center">
          <Field label="Current User" error="">
            <Input value={userName} onChange={e => handleNameChange(e.target.value)} placeholder="e.g. Judah" className="w-32 bg-white" />
          </Field>
          <Field label="Date" error="">
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="bg-white" />
          </Field>
          <Button variant="outline" onClick={() => window.print()} className="mt-6">Print</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-800">Opening Cash</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-between items-center">
            <span className="text-2xl font-bold text-blue-900">{formatCurrency(data?.openingCash || 0)}</span>
            <Button variant="ghost" size="sm" onClick={() => handleOpeningBalanceEdit("cash")} className="print:hidden h-8 px-2 text-blue-700">Edit</Button>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-800">Opening Bank</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-between items-center">
            <span className="text-2xl font-bold text-blue-900">{formatCurrency(data?.openingBank || 0)}</span>
            <Button variant="ghost" size="sm" onClick={() => handleOpeningBalanceEdit("bank")} className="print:hidden h-8 px-2 text-blue-700">Edit</Button>
          </CardContent>
        </Card>
        <Card className="bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800">Closing Cash</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-900">{formatCurrency(data?.closingCash || 0)}</span>
          </CardContent>
        </Card>
        <Card className="bg-green-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800">Closing Bank</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-900">{formatCurrency(data?.closingBank || 0)}</span>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Income Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Cash Sales</p>
                  <p className="text-xl font-semibold text-green-600">{formatCurrency(data?.cashSales || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Bank/GPay Sales</p>
                  <p className="text-xl font-semibold text-green-600">{formatCurrency(data?.bankSales || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Credit Sales (Unpaid)</p>
                  <p className="text-xl font-semibold text-amber-600">{formatCurrency(data?.creditSales || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Party Collections (Cash)</p>
                  <p className="text-xl font-semibold text-emerald-600">{formatCurrency(data?.cashCollections || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Party Collections (Bank)</p>
                  <p className="text-xl font-semibold text-emerald-600">{formatCurrency(data?.bankCollections || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Income (Cash+Bank)</p>
                  <p className="text-xl font-bold">{formatCurrency((data?.cashSales || 0) + (data?.bankSales || 0) + (data?.cashCollections || 0) + (data?.bankCollections || 0))}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Expenses Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Diesel</p>
                  <p className="text-xl font-semibold text-red-600">{formatCurrency(data?.dieselExp || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Labour</p>
                  <p className="text-xl font-semibold text-red-600">{formatCurrency(data?.labourExp || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Vehicle</p>
                  <p className="text-xl font-semibold text-red-600">{formatCurrency(data?.vehicleExp || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Other Expenses</p>
                  <p className="text-xl font-semibold text-red-600">{formatCurrency(data?.otherExp || 0)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Total Expenses</p>
                  <p className="text-xl font-bold text-red-600">{formatCurrency(data?.cashExp || 0)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="print:hidden">
            <CardHeader>
              <CardTitle>Cash ⇄ Bank Transfer</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleTransfer} className="space-y-4">
                <Field label="Type" error="">
                  <select 
                    className="flex h-9 w-full rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm"
                    value={transferForm.type}
                    onChange={e => setTransferForm({...transferForm, type: e.target.value})}
                  >
                    <option value="CASH_TO_BANK">Cash to Bank</option>
                    <option value="BANK_TO_CASH">Bank to Cash</option>
                  </select>
                </Field>
                <Field label="Amount" error="">
                  <Input type="number" min="1" required value={transferForm.amount} onChange={e => setTransferForm({...transferForm, amount: e.target.value})} />
                </Field>
                <Field label="Remarks" error="">
                  <Input placeholder="Optional..." value={transferForm.remarks} onChange={e => setTransferForm({...transferForm, remarks: e.target.value})} />
                </Field>
                <Button type="submit" className="w-full">Record Transfer</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {data?.transfers?.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transfers recorded.</p>
              ) : (
                <div className="space-y-3">
                  {data?.transfers?.map((t: any) => (
                    <div key={t.id} className="flex justify-between items-center border-b pb-2">
                      <div>
                        <p className="text-sm font-medium">{t.type === "CASH_TO_BANK" ? "Cash → Bank" : "Bank → Cash"}</p>
                        <p className="text-xs text-muted-foreground">{t.time} • {t.userName}</p>
                        {t.remarks && <p className="text-xs text-muted-foreground italic">{t.remarks}</p>}
                      </div>
                      <p className="font-semibold">{formatCurrency(t.amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
