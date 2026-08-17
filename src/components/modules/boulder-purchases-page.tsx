"use client";
import { usePrompt } from "@/components/ui/prompt-provider";
import { handlePrint } from "@/lib/utils/print";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Save, Search, Trash2, X, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { listIncomingBoulder, saveIncomingBoulder, deleteIncomingBoulder } from "@/app/actions/purchases";
import { checkDuplicateSaleBookNumber as checkDuplicateBookNumber, getLastBookPage } from "@/app/actions/sales";
import { listVehicles } from "@/app/actions/vehicles";
import { cn, formatCurrency, formatDate, formatQty, todayInputValue } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";

type BoulderRow = {
  id: string;
  date: string;
  bookNumber?: number | null;
  pageNumber?: number | null;
  vehicleNumber: string;
  partyName: string;
  materialName: string;
  qty: number;
  remarks?: string | null;
  time?: string | null;
  rockRate: number;
  amount: number;
  cashPaid: number;
  bankPaid: number;
  gPayPaid: number;
  paidTotal: number;
  remainingCredit: number;
  vehicleRent: number;
  combinedPayment: boolean;
  settled: boolean;
  createdAt: string;
};

function blankForm() {
  return {
    id: "",
    date: todayInputValue(),
    bookNumber: "",
    pageNumber: "",
    vehicleId: "",
    vehicleNumber: "",
    partyName: "",
    qty: "",
    rockRate: "26",
    cashPaid: "0",
    bankPaid: "0",
    gPayPaid: "0",
    vehicleRent: "0",
    combinedPayment: false,
    remarks: "",
  };
}

function dateInput(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function BoulderPurchasesPage() {
  const [form, setForm] = useState(() => blankForm());
  const [rows, setRows] = useState<BoulderRow[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { confirmAction, promptPassword } = usePrompt();

  useEffect(() => {
    listVehicles("").then((v) => setVehicles(v as any[]));
    if (!form.id) {
      getLastBookPage().then(({ bookNumber, pageNumber }) => {
        let nextBook = bookNumber;
        let nextPage = pageNumber + 1;
        if (nextPage > 100) {
          nextBook = bookNumber + 1;
          nextPage = 1;
        }
        setForm((prev) => ({
          ...prev,
          bookNumber: String(nextBook),
          pageNumber: String(nextPage),
        }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    const data = (await listIncomingBoulder(search)) as BoulderRow[];
    setRows(data);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  function edit(row: BoulderRow) {
    setForm({
      id: row.id,
      date: dateInput(row.date),
      bookNumber: row.bookNumber != null ? String(row.bookNumber) : "",
      pageNumber: row.pageNumber != null ? String(row.pageNumber) : "",
      vehicleId: "",
      vehicleNumber: row.vehicleNumber,
      partyName: row.partyName,
      qty: String(row.qty),
      rockRate: String(row.rockRate),
      cashPaid: String(row.cashPaid),
      bankPaid: String(row.bankPaid),
      gPayPaid: String(row.gPayPaid),
      vehicleRent: String(row.vehicleRent),
      combinedPayment: row.combinedPayment,
      remarks: row.remarks ?? "",
    });
    setMessage("");
    setError("");
  }

  function selectVehicle(id: string) {
    const vehicle = vehicles.find((v) => v.id === id);
    if (!vehicle) return;
    setForm((current) => ({
      ...current,
      vehicleId: vehicle.id,
      vehicleNumber: vehicle.vehicleNumber,
      partyName: vehicle.partyName || current.partyName,
    }));
  }

  async function submit() {
    if (isSubmitting) return;
    setError("");
    setMessage("");
    setIsSubmitting(true);
    try {
      if (!form.qty || Number(form.qty) <= 0) throw new Error("Quantity must be greater than 0.");
      if (!form.rockRate || Number(form.rockRate) < 0) throw new Error("Rock Rate must be a valid number.");

      if (form.bookNumber && form.pageNumber) {
        const isDuplicate = await checkDuplicateBookNumber(
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

      await saveIncomingBoulder(form);
      setMessage(form.id ? "Boulder entry updated." : "Boulder entry saved.");
      setForm(blankForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function remove(id: string) {
    const password = await promptPassword("Enter Admin/Delete PIN to remove this boulder entry:");
    if (!password) return;
    
    if (!(await confirmAction("Delete this boulder entry?"))) return;
    setError("");
    try {
      const __res = await deleteIncomingBoulder(id, password);
      if (__res && !__res.success) throw new Error(__res.error || "Delete failed");
      if (form.id === id) setForm(blankForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  function handleExportExcel() {
    if (rows.length === 0) return;
    
    let totalQty = 0;
    let totalAmount = 0;
    let totalPaid = 0;
    let totalCredit = 0;

    const excelData: Record<string, any>[] = rows.map((row) => {
      totalQty += row.qty;
      totalAmount += row.amount;
      totalPaid += row.paidTotal;
      totalCredit += row.remainingCredit;

      return {
        Date: formatDate(row.date),
        "Book/Page": row.bookNumber && row.pageNumber ? `${row.bookNumber}/${row.pageNumber}` : row.bookNumber || row.pageNumber || "-",
        Vehicle: row.vehicleNumber,
        Supplier: row.partyName,
        Qty: row.qty,
        Rate: row.rockRate,
        Amount: row.amount,
        "Cash Paid": row.cashPaid,
        "Bank/GPay": row.bankPaid + row.gPayPaid,
        "Rent": row.vehicleRent,
        "Paid": row.paidTotal,
        "Credit": row.remainingCredit,
        "Settled": row.settled ? "Yes" : "No",
        Remarks: row.remarks || "-"
      };
    });
    
    excelData.push({
      Date: "TOTAL",
      "Book/Page": "",
      Vehicle: "",
      Supplier: "",
      Qty: totalQty,
      Rate: "",
      Amount: totalAmount,
      "Cash Paid": "",
      "Bank/GPay": "",
      "Rent": "",
      Paid: totalPaid,
      Credit: totalCredit,
      Settled: "",
      Remarks: ""
    });

    exportToExcel(excelData, `Boulder_Purchases_${new Date().toISOString().slice(0,10)}`);
  }

  return (
    <div className="space-y-5 p-4 lg:p-6 print:p-0 print:space-y-0 print:max-w-none">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-normal">Incoming Boulder</h1>
        <p className="text-sm text-muted-foreground">ROCK material entries stored in the local database.</p>
      </div>

      <div className="hidden print:block mb-8 text-center border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">MBM QUARRY</h1>
        <p className="text-muted-foreground text-sm uppercase tracking-wider mt-1">Boulder Purchases Report</p>
        <div className="mt-6 flex justify-between items-end text-left">
          <div>
            <p className="text-sm text-muted-foreground">Report Date</p>
            <h2 className="text-xl font-bold">{new Date().toLocaleDateString('en-IN')}</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Generated On</p>
            <p className="font-medium">{new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      <Card className="print:hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>{form.id ? "Edit Boulder Entry" : "Boulder Entry"}</CardTitle>
          {form.id ? (
            <Button variant="ghost" size="icon" onClick={() => setForm(blankForm())} aria-label="Cancel edit">
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Date" htmlFor="date">
              <Input id="date" type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </Field>
            <Field label="Book No" htmlFor="bookNumber">
              <Input id="bookNumber" type="number" min="1" value={form.bookNumber} onChange={(event) => setForm((current) => ({ ...current, bookNumber: event.target.value }))} />
            </Field>
            <Field label="Page No" htmlFor="pageNumber">
              <Input id="pageNumber" type="number" min="1" max="100" value={form.pageNumber} onChange={(event) => setForm((current) => ({ ...current, pageNumber: event.target.value }))} />
            </Field>
            <Field label="Vehicle Number" htmlFor="boulderVehicleNumber">
              <SearchableSelect
                id="boulderVehicleNumber"
                aria-label="Vehicle Number"
                value={form.vehicleId}
                customValue={form.vehicleNumber}
                allowCustom
                placeholder="Search or type vehicle"
                options={vehicles.map((v) => ({ value: v.id, label: v.vehicleNumber, description: v.partyName }))}
                onChange={selectVehicle}
                onCustomValueChange={(vehicleNumber) => setForm((current) => ({ ...current, vehicleNumber, vehicleId: "" }))}
              />
            </Field>
            <Field label="Party Name" htmlFor="partyName">
              <Input id="partyName" value={form.partyName} onChange={(event) => setForm((current) => ({ ...current, partyName: event.target.value }))} />
            </Field>
            <div className="space-y-2">
              <Field label="Qty" htmlFor="qty">
                <Input
                  id="qty"
                  className="text-right tabular-nums"
                  type="number"
                  step="0.001"
                  value={form.qty}
                  onChange={(event) => setForm((current) => ({ ...current, qty: event.target.value }))}
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
                        onClick={() => setForm((current) => ({ ...current, qty: String(vehicle.companyBodyQty) }))}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${Number(form.qty) === vehicle.companyBodyQty ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'}`}
                      >
                        🚛 Company: {vehicle.companyBodyQty}
                      </button>
                    ) : null}
                    {vehicle.extraBodyQty ? (
                      <button 
                        type="button" 
                        onClick={() => setForm((current) => ({ ...current, qty: String(vehicle.extraBodyQty) }))}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${Number(form.qty) === vehicle.extraBodyQty ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'bg-background text-muted-foreground border-input hover:bg-accent hover:text-accent-foreground'}`}
                      >
                        📦 Extra: {vehicle.extraBodyQty}
                      </button>
                    ) : null}
                  </div>
                );
              })()}
            </div>
            <Field label="Rock Rate (₹)" htmlFor="rockRate">
              <Input
                id="rockRate"
                className="text-right tabular-nums"
                type="number"
                step="0.01"
                value={form.rockRate}
                onChange={(event) => setForm((current) => ({ ...current, rockRate: event.target.value }))}
              />
            </Field>
            <Field label="Cash Paid" htmlFor="cashPaid">
              <Input
                id="cashPaid"
                className="text-right tabular-nums"
                type="number"
                value={form.cashPaid}
                onChange={(event) => setForm((current) => ({ ...current, cashPaid: event.target.value }))}
              />
            </Field>
            <Field label="Bank Paid" htmlFor="bankPaid">
              <Input
                id="bankPaid"
                className="text-right tabular-nums"
                type="number"
                value={form.bankPaid}
                onChange={(event) => setForm((current) => ({ ...current, bankPaid: event.target.value }))}
              />
            </Field>
            <Field label="GPay Paid" htmlFor="gPayPaid">
              <Input
                id="gPayPaid"
                className="text-right tabular-nums"
                type="number"
                value={form.gPayPaid}
                onChange={(event) => setForm((current) => ({ ...current, gPayPaid: event.target.value }))}
              />
            </Field>
            <Field label="Vehicle Rent" htmlFor="vehicleRent">
              <Input
                id="vehicleRent"
                className="text-right tabular-nums"
                type="number"
                value={form.vehicleRent}
                onChange={(event) => setForm((current) => ({ ...current, vehicleRent: event.target.value }))}
              />
            </Field>
            <div className="flex items-center space-x-2 pt-8">
              <input
                type="checkbox"
                id="combinedPayment"
                className="h-4 w-4 rounded border-gray-300"
                checked={form.combinedPayment}
                onChange={(event) => setForm((current) => ({ ...current, combinedPayment: event.target.checked }))}
              />
              <label htmlFor="combinedPayment" className="text-sm font-medium leading-none">
                Rent included in Payment
              </label>
            </div>
            <Field label="Remarks" className="md:col-span-2" htmlFor="remarks">
              <Textarea id="remarks" value={form.remarks} onChange={(event) => setForm((current) => ({ ...current, remarks: event.target.value }))} />
            </Field>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1">
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2 bg-green-50/50 hover:bg-green-100/50 text-green-700 border-green-200" onClick={() => setForm(f => ({ ...f, cashPaid: String((Number(f.qty) || 0) * (Number(f.rockRate) || 0)), bankPaid: "0", gPayPaid: "0" }))}>💵 Full Cash</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2 bg-blue-50/50 hover:bg-blue-100/50 text-blue-700 border-blue-200" onClick={() => setForm(f => ({ ...f, cashPaid: "0", bankPaid: "0", gPayPaid: String((Number(f.qty) || 0) * (Number(f.rockRate) || 0)) }))}>📱 Full GPay</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2 bg-purple-50/50 hover:bg-purple-100/50 text-purple-700 border-purple-200" onClick={() => setForm(f => ({ ...f, cashPaid: "0", bankPaid: String((Number(f.qty) || 0) * (Number(f.rockRate) || 0)), gPayPaid: "0" }))}>🏦 Full Bank</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs px-2 bg-amber-50/50 hover:bg-amber-100/50 text-amber-700 border-amber-200" onClick={() => setForm(f => ({ ...f, cashPaid: "0", bankPaid: "0", gPayPaid: "0" }))}>📝 Full Credit</Button>
            </div>
            <div className="flex gap-4 p-3 bg-muted/50 rounded-lg">
              <div className="text-sm">
                <span className="text-muted-foreground">Amount: </span>
                <span className="font-semibold">{formatCurrency((Number(form.qty) || 0) * (Number(form.rockRate) || 0))}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Paid Total: </span>
                <span className="font-semibold text-emerald-600">
                  {formatCurrency((Number(form.cashPaid) || 0) + (Number(form.bankPaid) || 0) + (Number(form.gPayPaid) || 0))}
                </span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Credit Balance: </span>
                <span className="font-semibold text-destructive">
                  {formatCurrency(((Number(form.qty) || 0) * (Number(form.rockRate) || 0)) - ((Number(form.cashPaid) || 0) + (Number(form.bankPaid) || 0) + (Number(form.gPayPaid) || 0)))}
                </span>
              </div>
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}
          <div>
            <Button onClick={() => void submit()}>
              <Save className="h-4 w-4" />
              {form.id ? "Save Changes" : "Save Boulder Entry"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="print:border-none print:shadow-none">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 print:hidden">
          <CardTitle>Boulder Table</CardTitle>
          <div className="flex w-full sm:w-auto gap-2 items-center">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="boulderSearch" aria-label="Search boulder entries" className="pl-9" placeholder="Search boulder entries..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => handlePrint()} className="text-xs gap-1.5">
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </CardHeader>
        <CardContent className="print:p-0">
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-[350px])] sm:max-h-[60vh] rounded-md border print:border-none print:overflow-visible print:max-h-none">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10 shadow-sm print:bg-transparent print:border-b-2 print:border-black print:relative print:shadow-none">
              <TableRow>
                <TableHead className="sm:sticky sm:left-0 z-20 bg-muted w-[110px] min-w-[110px] max-w-[110px] sm:border-r border-border print:static print:w-auto print:border-none">Date</TableHead>
                <TableHead>Book/Page</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">Bank/GPay</TableHead>
                <TableHead className="text-right">Rent</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-center">Settled</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead className="w-24 text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="print:border-b print:border-gray-200 group bg-background hover:bg-muted">
                  <TableCell className="sm:sticky sm:left-0 z-10 bg-inherit w-[110px] min-w-[110px] max-w-[110px] sm:border-r border-border print:static print:w-auto print:border-none">{formatDate(row.date)}</TableCell>
                  <TableCell>
                    {row.bookNumber && row.pageNumber ? `${row.bookNumber}/${row.pageNumber}` : row.bookNumber || row.pageNumber || "-"}
                  </TableCell>
                  <TableCell>{row.vehicleNumber}</TableCell>
                  <TableCell className="truncate max-w-[150px]" title={row.partyName}>{row.partyName}</TableCell>
                  <TableCell className="number-cell font-medium">{formatQty(row.qty, "")}</TableCell>
                  <TableCell className="number-cell text-muted-foreground">{formatCurrency(row.rockRate)}</TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="number-cell">{(row.cashPaid ?? 0) > 0 ? formatCurrency(row.cashPaid ?? 0) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="number-cell">{((row.bankPaid ?? 0) + (row.gPayPaid ?? 0)) > 0 ? formatCurrency((row.bankPaid ?? 0) + (row.gPayPaid ?? 0)) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="number-cell">
                    {(row.vehicleRent ?? 0) > 0 ? (
                      <div className="flex flex-col items-end">
                        <span>{formatCurrency(row.vehicleRent ?? 0)}</span>
                        {row.combinedPayment && <span className="text-[10px] text-muted-foreground leading-none">Incl.</span>}
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="number-cell text-emerald-600 font-medium">{(row.paidTotal ?? 0) > 0 ? formatCurrency(row.paidTotal ?? 0) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className={cn("number-cell", (row.remainingCredit ?? 0) > 0 && "text-destructive font-semibold")}>{(row.remainingCredit ?? 0) > 0 ? formatCurrency(row.remainingCredit ?? 0) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-center">{row.settled ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="max-w-40 truncate print:whitespace-normal" title={row.remarks || ""}>{row.remarks}</TableCell>
                  <TableCell className="text-right print:hidden">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => edit(row)} aria-label="Edit boulder entry">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete boulder entry">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={15} className="h-24 text-center text-muted-foreground">
                    No boulder entries found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
