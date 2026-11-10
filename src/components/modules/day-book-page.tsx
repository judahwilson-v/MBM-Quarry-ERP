"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { formatCurrency, todayInputValue } from "@/lib/utils";
import { UserCircle } from "lucide-react";
import { fetchDayBookData, saveCashTransfer, logDayBookAudit } from "@/lib/daybook-actions";
import { saveDayBookOpeningBalances } from "@/app/actions/daybook_offline";
import { usePrompt } from "@/components/ui/prompt-provider";
import { handlePrint } from "@/lib/utils/print";
import { parseTransferDraft, restoreTransferDraft, transferDraftNotice, TRANSFER_DRAFT_KEY, type TransferDraft } from "@/lib/transfer-draft";

export function DayBookPage() {
  const [date, setDate] = useState<string>(todayInputValue());
  const [userName, setUserName] = useState<string>("");
  const [data, setData] = useState<any>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const { promptNumber, confirmAction } = usePrompt();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDayBookData(date);
      setData(result);
      setLoadError("");
    } catch (e) {
      // Server actions return a generic digest message in production, so the
      // raw error text is never useful or safe to render. Keep diagnostics in
      // the console and show one truthful, static reason instead of wrong totals.
      console.error(e);
      setData(null);
      setLoadError("unverified");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    const savedName = sessionStorage.getItem("mbm_user_name") || "";
    setUserName(savedName);
    void loadData();
  }, [loadData]);

  const handleNameChange = (val: string) => {
    setUserName(val);
    sessionStorage.setItem("mbm_user_name", val);
  };

  const handleOpeningBalanceEdit = async (type: "cash" | "bank") => {
    if (!userName) {
      alert("Please enter your name in the User field to track edits.");
      return;
    }
    const currentVal = type === "cash" ? (data?.openingCash ?? 0) : (data?.openingBank ?? 0);
    const newVal = await promptNumber(`Enter new Opening ${type === "cash" ? "Cash" : "Bank"} Balance:`);
    if (!newVal || isNaN(Number(newVal))) return;

    const numVal = Number(newVal);
    if (numVal === currentVal) return;

    const confirmed = await confirmAction(`Update opening ${type} from ${formatCurrency(currentVal)} to ${formatCurrency(numVal)}?`);
    if (!confirmed) return;

    try {
      const payload = {
        businessDate: date,
        openingCashBalance: type === "cash" ? numVal : (data?.openingCash ?? 0),
        openingBankBalance: type === "bank" ? numVal : (data?.openingBank ?? 0),
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

  // FULL68: a transfer attempt is persisted with its client-generated
  // submission reference BEFORE sending. An ambiguous outcome (dropped
  // response, reload) retries the same reference, and the server returns the
  // original row instead of duplicating the transfer. The draft clears only on
  // a settled success; editing the form while a draft is pending keeps the same
  // reference, so the server refuses a changed intent honestly and the history
  // can be checked first. Discarding a draft never deletes a saved record.
  const [pendingTransferDraft, setPendingTransferDraft] = useState<TransferDraft | null>(null);

  // FULL70: restore the original attempt visibly, including its date. The
  // datepicker must show the day the attempt was made for - never silently
  // today - so an unchanged-looking retry carries the same intent.
  useEffect(() => {
    const draft = parseTransferDraft(sessionStorage.getItem(TRANSFER_DRAFT_KEY));
    if (!draft) {
      sessionStorage.removeItem(TRANSFER_DRAFT_KEY);
      return;
    }
    const restored = restoreTransferDraft(draft);
    setTransferForm({ type: restored.type, amount: restored.amount, remarks: restored.remarks });
    setDate(restored.date);
    setPendingTransferDraft(draft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName) {
      alert("Please enter your name in the User field to track transfers.");
      return;
    }
    if (!transferForm.amount || isNaN(Number(transferForm.amount)) || Number(transferForm.amount) <= 0) return;

    let draft = parseTransferDraft(sessionStorage.getItem(TRANSFER_DRAFT_KEY));
    if (!draft) {
      draft = {
        submissionId: crypto.randomUUID(),
        type: transferForm.type,
        amount: Number(transferForm.amount),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        date,
        remarks: transferForm.remarks,
        userName
      };
    }
    // Send the current form content under the persisted reference: unchanged
    // retry completes idempotently; changed intent is refused by the server.
    const attempt: TransferDraft = { ...draft, type: transferForm.type, amount: Number(transferForm.amount), date, remarks: transferForm.remarks, userName, attempted: true };
    sessionStorage.setItem(TRANSFER_DRAFT_KEY, JSON.stringify(attempt));
    try {
      await saveCashTransfer({
        submissionId: attempt.submissionId,
        type: attempt.type,
        amount: attempt.amount,
        time: attempt.time,
        date: attempt.date,
        remarks: attempt.remarks,
        userName: attempt.userName
      });
      sessionStorage.removeItem(TRANSFER_DRAFT_KEY);
      setPendingTransferDraft(null);
      setTransferForm({ type: "CASH_TO_BANK", amount: "", remarks: "" });
      await loadData();
    } catch (err) {
      setPendingTransferDraft(attempt);
      alert(err instanceof Error && err.message ? err.message : "Failed to save transfer.");
    }
  };

  // Discarding clears only the local reminder. It never deletes a record that
  // may already be saved, and the notice wording says so.
  const discardTransferDraft = () => {
    sessionStorage.removeItem(TRANSFER_DRAFT_KEY);
    setPendingTransferDraft(null);
    setTransferForm({ type: "CASH_TO_BANK", amount: "", remarks: "" });
  };

  if (loading && !data) return <div className="p-6">Loading Day Book...</div>;
  if (loadError) {
    return (
      <div role="alert" className="space-y-3 p-6">
        <p className="font-medium text-destructive">This day's balance cannot be shown.</p>
        <p className="text-sm text-muted-foreground">
          Some financial records for this day could not be verified, so no totals are shown instead of showing wrong figures. Please ask the administrator to review the day's records.
        </p>
        <Button variant="outline" onClick={() => void loadData()}>Try again</Button>
      </div>
    );
  }

  const transfers = data?.transfers ?? [];

  return (
    <div className="space-y-6 p-4 lg:p-6 print:p-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Day Book</h1>
          <p className="text-muted-foreground">Daily financial summary and transfers.</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 mt-6" title="Your name for tracking edits">
            <UserCircle className="h-5 w-5 text-muted-foreground" />
            <Input
              value={userName}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Enter your name"
              className="h-9 w-36"
            />
          </div>
          <Field label="Date" error="">
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
          <Button variant="outline" onClick={() => handlePrint()} className="mt-6">Print</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-50/50 dark:bg-blue-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-800 dark:text-blue-200">Opening Cash</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-between items-center">
            <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">{formatCurrency(data?.openingCash || 0)}</span>
            <Button variant="ghost" size="sm" onClick={() => handleOpeningBalanceEdit("cash")} className="print:hidden h-8 px-2 text-blue-700">Edit</Button>
          </CardContent>
        </Card>
        <Card className="bg-blue-50/50 dark:bg-blue-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-blue-800 dark:text-blue-200">Opening Bank</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-between items-center">
            <span className="text-2xl font-bold text-blue-900 dark:text-blue-100">{formatCurrency(data?.openingBank || 0)}</span>
            <Button variant="ghost" size="sm" onClick={() => handleOpeningBalanceEdit("bank")} className="print:hidden h-8 px-2 text-blue-700">Edit</Button>
          </CardContent>
        </Card>
        <Card className="bg-green-50/50 dark:bg-green-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800 dark:text-green-200">Closing Cash</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-900 dark:text-green-100">{formatCurrency(data?.closingCash || 0)}</span>
          </CardContent>
        </Card>
        <Card className="bg-green-50/50 dark:bg-green-950/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-green-800 dark:text-green-200">Closing Bank</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold text-green-900 dark:text-green-100">{formatCurrency(data?.closingBank || 0)}</span>
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
                    className="flex h-9 w-full rounded-md border border-input px-3 py-1 text-sm shadow-sm"
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
                {pendingTransferDraft && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    {transferDraftNotice(pendingTransferDraft).message}
                    <button type="button" className="ml-2 underline" onClick={discardTransferDraft}>{transferDraftNotice(pendingTransferDraft).discardLabel}</button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s Transfers</CardTitle>
            </CardHeader>
            <CardContent>
              {transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transfers recorded.</p>
              ) : (
                <div className="space-y-3">
                  {transfers.map((t: any) => (
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
