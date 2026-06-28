"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Printer, Trash2 } from "lucide-react";
import { usePrompt } from "@/components/ui/prompt-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  listPartiesWithBalances,
  listPartyLedgerEntries,
  savePartyCollection,
  savePartyPayment,
  deletePartyCollection,
  deletePartyPayment,
} from "@/lib/offline-actions";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type PartySummary = {
  id: string;
  partyName: string;
  balance: number;
};

type PartyLedgerEntry = {
  id: string;
  partyId: string;
  partyName: string;
  date: string;
  time?: string;
  type: string;
  refId: string;
  description: string;
  paymentMethod?: string;
  debitAmount: number;
  creditAmount: number;
  balance: number;
  createdAt: string;
};

export function PartyLedgerPage() {
  const [summary, setSummary] = useState<PartySummary[]>([]);
  const [selectedParty, setSelectedParty] = useState<PartySummary | null>(null);
  const [entries, setEntries] = useState<PartyLedgerEntry[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const { confirmAction } = usePrompt();

  const [paymentMode, setPaymentMode] = useState<"collection" | "payment" | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    date: "",
    time: "",
    amount: "",
    paymentMethod: "Cash",
    remarks: "",
  });

  const loadSummary = useCallback(async () => {
    try {
      setSummary((await listPartiesWithBalances()) as unknown as PartySummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load party balances.");
    }
  }, []);

  const loadEntries = useCallback(async (party: PartySummary) => {
    setSelectedParty(party);
    setEntries((await listPartyLedgerEntries(party.id)) as unknown as PartyLedgerEntry[]);
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const visibleSummary = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? summary.filter((row) => row.partyName.toLowerCase().includes(query)) : summary;
  }, [search, summary]);

  async function handlePaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedParty) return;
    try {
      setError("");
      let cashPaid = "0";
      let bankPaid = "0";
      let gPayPaid = "0";
      if (paymentForm.paymentMethod === "Cash") cashPaid = paymentForm.amount;
      if (paymentForm.paymentMethod === "Bank") bankPaid = paymentForm.amount;
      if (paymentForm.paymentMethod === "GPay") gPayPaid = paymentForm.amount;

      let finalDate = paymentForm.date ? new Date(paymentForm.date) : new Date();
      if (paymentForm.date && paymentForm.time) {
        finalDate = new Date(`${paymentForm.date}T${paymentForm.time}`);
      }

      if (paymentMode === "collection") {
        await savePartyCollection({
          partyName: selectedParty.partyName,
          collectionDate: finalDate.toISOString(),
          cashPaid,
          bankPaid,
          gPayPaid,
          remarks: paymentForm.remarks,
        });
      } else if (paymentMode === "payment") {
        await savePartyPayment({
          partyName: selectedParty.partyName,
          paymentDate: finalDate.toISOString(),
          cashPaid,
          bankPaid,
          gPayPaid,
          remarks: paymentForm.remarks,
        });
      }
      setPaymentMode(null);
      setPaymentForm({ date: "", time: "", amount: "", paymentMethod: "Cash", remarks: "" });
      await loadSummary();
      await loadEntries(selectedParty);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process payment.");
    }
  }

  async function handleDeleteEntry(entry: PartyLedgerEntry) {
    if (!selectedParty) return;
    if (entry.type !== "PAYMENT_RECEIVED" && entry.type !== "PAYMENT_GIVEN") return;
    
    const typeLabel = entry.type === "PAYMENT_RECEIVED" ? "Collection" : "Payment";
    if (!(await confirmAction(`Delete this ${typeLabel} of ${formatCurrency(entry.creditAmount || entry.debitAmount)}?`))) return;
    
    try {
      if (entry.type === "PAYMENT_RECEIVED") {
        await deletePartyCollection(entry.refId);
      } else {
        await deletePartyPayment(entry.refId);
      }
      await loadSummary();
      await loadEntries(selectedParty);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not delete ${typeLabel.toLowerCase()}.`);
    }
  }

  async function printReceipt(row: PartyLedgerEntry) {
    const typeLabel = row.type === "PAYMENT_RECEIVED" ? "Receipt" : row.type === "PAYMENT_GIVEN" ? "Payment Voucher" : "Voucher";
    const amount = row.creditAmount > 0 ? row.creditAmount : row.debitAmount;
    
    const html = `
      <html>
        <head>
          <title>${typeLabel}</title>
          <style>
            body { font-family: monospace; padding: 20px; font-size: 14px; max-width: 300px; }
            h2 { text-align: center; margin-bottom: 5px; font-size: 18px; }
            .subtitle { text-align: center; margin-bottom: 20px; font-size: 12px; font-weight: bold; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 15px 0; }
            .footer { text-align: center; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <h2>MBM QUARRY</h2>
          <div class="subtitle">${typeLabel.toUpperCase()}</div>
          
          <div class="row">
            <span>Date:</span>
            <span>${formatDate(row.date)}</span>
          </div>
          <div class="row">
            <span>Party:</span>
            <span>${row.partyName}</span>
          </div>
          <div class="row">
            <span>Method:</span>
            <span>${row.paymentMethod || "CASH"}</span>
          </div>
          <div class="divider"></div>
          
          <div class="row bold">
            <span>Amount:</span>
            <span>₹${amount}</span>
          </div>
          
          ${row.description ? `
          <div style="margin-top: 10px; font-size: 12px">
            Remarks: ${row.description}
          </div>
          ` : ''}
          
          <div class="divider"></div>
          <div class="row">
            <span>New Balance:</span>
            <span class="${row.balance > 0 ? 'bold' : ''}">₹${Math.abs(row.balance)} ${row.balance > 0 ? 'Dr' : row.balance < 0 ? 'Cr' : ''}</span>
          </div>
          
          <div class="footer">Signature</div>
          <script>window.print(); setTimeout(() => window.close(), 500);</script>
        </body>
      </html>
    `;

    // Try silent print first if electron and enabled
    const { isElectron, printSilently } = await import("@/lib/electron");
    const isSilentEnabled = typeof window !== 'undefined' && localStorage.getItem('silentPrinting') === 'true';
    if (isElectron() && isSilentEnabled) {
      const res = await printSilently(undefined, html);
      if (res.success) return; // successful silent print
    }

    // Fallback to browser print
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  return (
    <div className="space-y-5 p-4 lg:p-6 print:p-0 print:space-y-0">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-normal">Party Ledger</h1>
        <p className="text-sm text-muted-foreground">Comprehensive running balance ledger for Customers and Suppliers.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 print:hidden">
          <Card className="h-full border-r border-t-0 border-b-0 border-l-0 shadow-none sm:border sm:shadow-sm">
            <CardHeader className="flex flex-col gap-3 pb-4">
              <CardTitle>Parties</CardTitle>
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search party..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              {error ? <p className="mb-3 px-4 text-sm text-destructive sm:px-0">{error}</p> : null}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Party</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleSummary.map((row) => (
                      <TableRow
                        key={row.id}
                        className={cn("cursor-pointer", selectedParty?.id === row.id && "bg-accent/70")}
                        onClick={() => void loadEntries(row)}
                      >
                        <TableCell className="font-medium">{row.partyName}</TableCell>
                        <TableCell className={cn("number-cell font-bold", row.balance < 0 ? "text-destructive" : "text-green-600")}>
                          {formatCurrency(Math.abs(row.balance))}
                          <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                            {row.balance > 0 ? "Dr" : row.balance < 0 ? "Cr" : ""}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {!visibleSummary.length ? (
                      <TableRow>
                        <TableCell colSpan={2} className="h-24 text-center text-muted-foreground">
                          No active party ledgers found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 print:col-span-3 w-full">
          {selectedParty ? (
            <div className="space-y-4">
              <div className="hidden print:block mb-8 text-center border-b pb-4">
                <h1 className="text-3xl font-bold tracking-tight">MBM QUARRY</h1>
                <p className="text-muted-foreground text-sm uppercase tracking-wider mt-1">Statement of Account</p>
                <div className="mt-6 flex justify-between items-end text-left">
                  <div>
                    <p className="text-sm text-muted-foreground">Party Name</p>
                    <h2 className="text-2xl font-bold">{selectedParty.partyName}</h2>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Generated On</p>
                    <p className="font-medium">{new Date().toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
                <div>
                  <h2 className="text-xl font-bold">{selectedParty.partyName} Ledger</h2>
                  <p className="text-sm text-muted-foreground">
                    Current Balance:{" "}
                    <span className={cn("font-bold", selectedParty.balance < 0 ? "text-destructive" : "text-green-600")}>
                      {formatCurrency(Math.abs(selectedParty.balance))}
                      {selectedParty.balance > 0 ? " Dr (Asset)" : selectedParty.balance < 0 ? " Cr (Liability)" : ""}
                    </span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => window.print()} className="print:hidden">
                    <Printer className="mr-2 h-4 w-4" />
                    Print Statement
                  </Button>
                  <Button variant="outline" onClick={() => setPaymentMode("payment")} className="print:hidden bg-red-50 text-red-700 hover:bg-red-100 border-red-200">
                    <Plus className="mr-2 h-4 w-4" />
                    Debit Receipt (Give)
                  </Button>
                  <Button onClick={() => setPaymentMode("collection")} className="bg-green-600 hover:bg-green-700 text-white">
                    <Plus className="mr-2 h-4 w-4" />
                    Collection (Receive)
                  </Button>
                </div>
              </div>

              {paymentMode && (
                <div className="print:hidden">
                <Card className="border-blue-200 bg-blue-50/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-blue-900">
                      {paymentMode === "collection" ? "Record Collection (Money In)" : "Record Debit Receipt (Money Out)"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handlePaymentSubmit} className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Date" error="">
                          <Input
                            type="date"
                            value={paymentForm.date}
                            onChange={(e) => setPaymentForm({ ...paymentForm, date: e.target.value })}
                          />
                        </Field>
                        <Field label="Amount" error="">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                            required
                          />
                        </Field>
                        <Field label="Payment Method" error="">
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 bg-white"
                            value={paymentForm.paymentMethod}
                            onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}
                          >
                            <option value="Cash">Cash</option>
                            <option value="Bank">Bank</option>
                            <option value="GPay">GPay</option>
                          </select>
                        </Field>
                        <Field label="Time" error="">
                          <Input
                            type="time"
                            value={paymentForm.time}
                            onChange={(e) => setPaymentForm({ ...paymentForm, time: e.target.value })}
                          />
                        </Field>
                      </div>
                      <Field label="Remarks" error="">
                        <Textarea
                          placeholder="Optional notes..."
                          value={paymentForm.remarks}
                          onChange={(e) => setPaymentForm({ ...paymentForm, remarks: e.target.value })}
                          className="h-16 resize-none bg-white"
                        />
                      </Field>
                      <div className="flex gap-2 justify-end">
                        <Button type="button" variant="outline" onClick={() => setPaymentMode(null)}>
                          Cancel
                        </Button>
                        <Button type="submit" className={paymentMode === "collection" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}>
                          Save {paymentMode === "collection" ? "Collection" : "Payment"}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
                </div>
              )}

              <Card className="print:border-none print:shadow-none">
                <CardContent className="p-0 sm:p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-muted/50 print:bg-transparent print:border-b-2 print:border-black">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Debit (+)</TableHead>
                          <TableHead className="text-right">Credit (-)</TableHead>
                          <TableHead className="text-right">Balance</TableHead>
                          <TableHead className="w-10 print:hidden"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell className="whitespace-nowrap print:border-b print:border-gray-200">{formatDate(entry.date)}</TableCell>
                            <TableCell className="whitespace-nowrap print:border-b print:border-gray-200">{entry.time || "-"}</TableCell>
                            <TableCell className="whitespace-nowrap print:border-b print:border-gray-200">{entry.type.replace("_", " ")}</TableCell>
                            <TableCell className="max-w-[200px] print:max-w-none print:whitespace-normal print:border-b print:border-gray-200" title={entry.description}>{entry.description}</TableCell>
                            <TableCell className="whitespace-nowrap print:border-b print:border-gray-200">{entry.paymentMethod || "-"}</TableCell>
                            <TableCell className="number-cell text-green-600 print:text-black print:border-b print:border-gray-200">{entry.debitAmount > 0 ? formatCurrency(entry.debitAmount) : "-"}</TableCell>
                            <TableCell className="number-cell text-destructive print:text-black print:border-b print:border-gray-200">{entry.creditAmount > 0 ? formatCurrency(entry.creditAmount) : "-"}</TableCell>
                            <TableCell className="number-cell font-medium print:border-b print:border-gray-200">
                              {formatCurrency(Math.abs(entry.balance))}
                              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                                {entry.balance > 0 ? "Dr" : entry.balance < 0 ? "Cr" : ""}
                              </span>
                            </TableCell>
                            <TableCell className="print:hidden">
                              {(entry.type === "PAYMENT_RECEIVED" || entry.type === "PAYMENT_GIVEN") && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={() => printReceipt(entry)}
                                    title="Print Slip"
                                  >
                                    <Printer className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => void handleDeleteEntry(entry)}
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {!entries.length ? (
                          <TableRow>
                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                              No ledger entries found.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    
                    {entries.length > 0 && (
                      <div className="hidden print:flex justify-end mt-8 border-t-2 border-black pt-4">
                        <div className="w-64">
                          <div className="flex justify-between font-bold text-lg">
                            <span>Closing Balance:</span>
                            <span>
                              {formatCurrency(Math.abs(selectedParty.balance))}
                              <span className="text-sm ml-1 font-normal text-muted-foreground">
                                {selectedParty.balance > 0 ? "Dr" : selectedParty.balance < 0 ? "Cr" : ""}
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed text-muted-foreground">
              Select a party from the list to view their ledger.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
