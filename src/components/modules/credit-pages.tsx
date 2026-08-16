"use client";
import { usePrompt } from "@/components/ui/prompt-provider";
import { handlePrint } from "@/lib/utils/print";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Save, Search, Trash2, X, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { deleteEmployeeCredit, listEmployeeCredits, saveEmployeeCredit } from "@/app/actions/employees";
import { listPartyCreditEntries, listPartyCreditSummary, listPartyCollectionHistory, listPartyCollectionSummary, savePartyCollection, deleteOtherCredit, listOtherCredits, saveOtherCredit } from "@/app/actions/credits";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { verifyEditPassword } from "@/app/actions/auth";

type PartySummary = {
  partyName: string;
  totalCredit: number;
  truckCount: number;
};

type PartyCreditEntry = {
  id: string;
  partyName: string;
  saleId: string;
  amount: number;
  status: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
  sale?: {
    bookNumber: number | null;
    pageNumber: number | null;
    saleDate: string | Date;
    vehicleNumber: string;
    materialName: string;
    qty: number;
  } | null;
};

type EmployeeCreditRow = {
  id: string;
  employeeName: string;
  amount: number;
  reason?: string | null;
  expectedDueDate?: string | Date | null;
  status: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

type OtherCreditRow = {
  id: string;
  name: string;
  amount: number;
  reason?: string | null;
  expectedDueDate?: string | Date | null;
  status: string;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

type PartyCollectionSummary = {
  partyName: string;
  totalCredit: number;
  collected: number;
  outstanding: number;
};

type PartyCollectionRow = {
  id: string;
  partyName: string;
  collectionDate: string | Date;
  cashPaid: number;
  bankPaid: number;
  gPayPaid: number;
  totalAmount: number;
  remarks?: string | null;
  createdAt: string | Date;
  updatedAt?: string | Date;
};

function blankEmployeeForm() {
  return {
    id: "",
    employeeName: "",
    amount: "",
    reason: "",
    expectedDueDate: "",
    status: "pending",
  };
}

function blankOtherForm() {
  return {
    id: "",
    name: "",
    amount: "",
    reason: "",
    expectedDueDate: "",
    status: "pending",
  };
}

function dateInput(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function PartyCreditPage() {
  const [summary, setSummary] = useState<PartySummary[]>([]);
  const [selectedParty, setSelectedParty] = useState("");
  const [entries, setEntries] = useState<PartyCreditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  

  const loadSummary = useCallback(async () => {
    try {
      setSummary((await listPartyCreditSummary()) as PartySummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load party credit.");
    }
  }, []);

  const loadEntries = useCallback(async (partyName: string) => {
    setSelectedParty(partyName);
    setEntries((await listPartyCreditEntries(partyName)) as PartyCreditEntry[]);
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const visibleSummary = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? summary.filter((row) => row.partyName.toLowerCase().includes(query)) : summary;
  }, [search, summary]);

  function handleExportExcel() {
    if (visibleSummary.length === 0) return;
    
    let totalCredit = 0;
    let totalTrucks = 0;

    const excelData = visibleSummary.map(row => {
      totalCredit += row.totalCredit;
      totalTrucks += row.truckCount;
      return {
        "Party Name": row.partyName,
        "Total Credit": row.totalCredit,
        "Truck Count": row.truckCount
      };
    });
    
    excelData.push({
      "Party Name": "TOTAL",
      "Total Credit": totalCredit,
      "Truck Count": totalTrucks
    });

    exportToExcel(excelData, `Party_Credit_Summary_${new Date().toISOString().slice(0,10)}`);
  }

  return (
    <div className="space-y-5 p-4 lg:p-6 print:p-0 print:space-y-0 print:max-w-none">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-normal">Party Credit</h1>
        <p className="text-sm text-muted-foreground">Credits grouped by party from outgoing sales.</p>
      </div>

      <div className="hidden print:block mb-8 text-center border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">MBM QUARRY</h1>
        <p className="text-muted-foreground text-sm uppercase tracking-wider mt-1">Party Credit Summary</p>
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

      <Card className="print:border-none print:shadow-none">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 print:hidden">
          <CardTitle>Party Summary</CardTitle>
          <div className="flex w-full sm:w-auto gap-2 items-center">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="partyCreditSearch" aria-label="Search party credit" className="pl-9" placeholder="Search party..." value={search} onChange={(event) => setSearch(event.target.value)} />
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
          {error ? <p className="mb-3 text-sm text-destructive print:hidden">{error}</p> : null}
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-[350px])] sm:max-h-[60vh] rounded-md border print:border-none print:overflow-visible print:max-h-none">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm print:bg-transparent print:border-b-2 print:border-black print:relative print:shadow-none">
              <TableRow>
                <TableHead>Party Name</TableHead>
                <TableHead className="text-right">Total Credit</TableHead>
                <TableHead className="text-right">Truck Count</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSummary.map((row) => (
                <TableRow
                  key={row.partyName}
                  className={cn("cursor-pointer print:border-b print:border-gray-200", selectedParty === row.partyName && "bg-accent/70")}
                  onClick={() => void loadEntries(row.partyName)}
                >
                  <TableCell className="font-medium">{row.partyName}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.totalCredit)}</TableCell>
                  <TableCell className="number-cell">{row.truckCount}</TableCell>
                </TableRow>
              ))}
              {!visibleSummary.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No party credit records found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {selectedParty ? (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle>{selectedParty} Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Book/Page</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{formatDate(entry.sale?.saleDate ?? entry.createdAt)}</TableCell>
                    <TableCell>{entry.sale?.bookNumber && entry.sale?.pageNumber ? `${entry.sale.bookNumber}/${entry.sale.pageNumber}` : "-"}</TableCell>
                    <TableCell>{entry.sale?.vehicleNumber ?? "-"}</TableCell>
                    <TableCell>{entry.sale?.materialName ?? "-"}</TableCell>
                    <TableCell className="number-cell">{entry.sale?.qty ?? "-"}</TableCell>
                    <TableCell className="number-cell font-medium">{formatCurrency(entry.amount)}</TableCell>
                    <TableCell className="capitalize">{entry.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function EmployeeCreditPage() {
  const { promptPassword, confirmAction } = usePrompt();
  const [rows, setRows] = useState<EmployeeCreditRow[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(() => blankEmployeeForm());
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  

  const load = useCallback(async () => {
    setRows((await listEmployeeCredits(search)) as EmployeeCreditRow[]);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  function startCreate() {
    setForm(blankEmployeeForm());
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function startEdit(row: EmployeeCreditRow) {
    setForm({
      id: row.id,
      employeeName: row.employeeName,
      amount: String(row.amount),
      reason: row.reason ?? "",
      expectedDueDate: dateInput(row.expectedDueDate),
      status: row.status,
    });
    setShowForm(true);
    setError("");
    setMessage("");
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      await saveEmployeeCredit(form);
      setMessage(form.id ? "Employee credit updated." : "Employee credit added.");
      setForm(blankEmployeeForm());
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction("Delete this employee credit?"))) return;
    const password = await promptPassword("Enter delete PIN:");
    if (!password || !(await verifyEditPassword(password, "delete"))) {
      setError("❌ Incorrect Delete PIN. Delete cancelled.");
      return;
    }
    setError("");
    try {
      const res = await deleteEmployeeCredit(id, password);
      if (res && !res.success) {
        setError(res.error || "Delete failed.");
        return;
      }
      if (form.id === id) setForm(blankEmployeeForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  function handleExportExcel() {
    if (rows.length === 0) return;
    
    let totalAmount = 0;

    const excelData = rows.map(row => {
      totalAmount += row.amount;
      return {
        "Employee Name": row.employeeName,
        Amount: row.amount,
        Reason: row.reason || "-",
        "Expected Due Date": row.expectedDueDate ? formatDate(row.expectedDueDate) : "-",
        Status: row.status
      };
    });
    
    excelData.push({
      "Employee Name": "TOTAL",
      Amount: totalAmount,
      Reason: "",
      "Expected Due Date": "",
      Status: ""
    });

    exportToExcel(excelData, `Employee_Credit_${new Date().toISOString().slice(0,10)}`);
  }

  return (
    <div className="space-y-5 p-4 lg:p-6 print:p-0 print:space-y-0 print:max-w-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Employee Credit</h1>
          <p className="text-sm text-muted-foreground">Employee advance and credit records.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportExcel} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => handlePrint()} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <div className="hidden print:block mb-8 text-center border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">MBM QUARRY</h1>
        <p className="text-muted-foreground text-sm uppercase tracking-wider mt-1">Employee Credit List</p>
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

      <Card className="print:border-none print:shadow-none">
        <CardContent className="grid gap-4 pt-5 print:p-0">
          <div className="relative print:hidden">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="empCreditSearch" aria-label="Search employee credit" className="pl-9" placeholder="Search employee credit..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          {showForm ? (
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">{form.id ? "Edit Employee Credit" : "New Employee Credit"}</div>
                <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} aria-label="Close form">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Employee Name" htmlFor="employeeName">
                  <Input id="employeeName" value={form.employeeName} onChange={(event) => setForm((current) => ({ ...current, employeeName: event.target.value }))} />
                </Field>
                <Field label="Amount" htmlFor="empAmount">
                  <Input
                    id="empAmount"
                    className="text-right tabular-nums"
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  />
                </Field>
                <Field label="Expected Due Date" htmlFor="empExpectedDueDate">
                  <Input
                    id="empExpectedDueDate"
                    type="date"
                    value={form.expectedDueDate}
                    onChange={(event) => setForm((current) => ({ ...current, expectedDueDate: event.target.value }))}
                  />
                </Field>
                <Field label="Status" htmlFor="empStatus">
                  <select
                    id="empStatus"
                    aria-label="Status"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
                <Field label="Reason" className="md:col-span-2 xl:col-span-4" htmlFor="empReason">
                  <Textarea id="empReason" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
                </Field>
              </div>
              <div className="mt-4">
                <Button onClick={() => void submit()}>
                  <Save className="h-4 w-4" />
                  {form.id ? "Save Changes" : "Create"}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive print:hidden">{error}</p> : null}
          {message ? <p className="text-sm text-success print:hidden">{message}</p> : null}

          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-[350px])] sm:max-h-[60vh] rounded-md border print:border-none print:overflow-visible print:max-h-none">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm print:bg-transparent print:border-b-2 print:border-black print:relative print:shadow-none">
              <TableRow>
                <TableHead>Employee Name</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Expected Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="print:border-b print:border-gray-200">
                  <TableCell className="font-medium">{row.employeeName}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="max-w-64 truncate print:whitespace-normal">{row.reason}</TableCell>
                  <TableCell>{row.expectedDueDate ? formatDate(row.expectedDueDate) : "-"}</TableCell>
                  <TableCell className="capitalize">{row.status}</TableCell>
                  <TableCell className="text-right print:hidden">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(row)} aria-label="Edit employee credit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete employee credit">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No employee credit records found.
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

function blankCollectionForm() {
  return {
    partyName: "",
    collectionDate: "",
    cashPaid: "",
    bankPaid: "",
    gPayPaid: "",
    remarks: "",
  };
}

export function PartyCollectionPage() {
  const [summary, setSummary] = useState<PartyCollectionSummary[]>([]);
  const [selectedParty, setSelectedParty] = useState("");
  const [history, setHistory] = useState<PartyCollectionRow[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(() => blankCollectionForm());
  const [error, setError] = useState("");
  
  const [message, setMessage] = useState("");

  const loadSummary = useCallback(async () => {
    try {
      setSummary((await listPartyCollectionSummary()) as PartyCollectionSummary[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collection summary.");
    }
  }, []);

  const loadHistory = useCallback(async (partyName: string) => {
    setSelectedParty(partyName);
    setHistory((await listPartyCollectionHistory(partyName)) as PartyCollectionRow[]);
    setForm((current) => ({ ...current, partyName }));
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const visibleSummary = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? summary.filter((row) => row.partyName.toLowerCase().includes(query)) : summary;
  }, [search, summary]);

  function handleExportExcel() {
    if (visibleSummary.length === 0) return;
    
    let totalOutstanding = 0;
    let totalCollected = 0;
    let totalCredit = 0;

    const excelData = visibleSummary.map(row => {
      totalOutstanding += row.outstanding;
      totalCollected += row.collected;
      totalCredit += row.totalCredit;
      return {
        "Party Name": row.partyName,
        "Outstanding": row.outstanding,
        "Collected": row.collected,
        "Total Credit": row.totalCredit
      };
    });
    
    excelData.push({
      "Party Name": "TOTAL",
      "Outstanding": totalOutstanding,
      "Collected": totalCollected,
      "Total Credit": totalCredit
    });

    exportToExcel(excelData, `Party_Collections_Summary_${new Date().toISOString().slice(0,10)}`);
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      const savedPartyName = form.partyName;
      await savePartyCollection(form);
      setMessage("Collection recorded.");
      setForm(blankCollectionForm());
      if (savedPartyName) {
        await loadHistory(savedPartyName);
      }
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Collection save failed.");
    }
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Credit Collections</h1>
        <p className="text-sm text-muted-foreground">Record cash, bank, and GPay collections against party outstanding balances.</p>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Party Outstanding</CardTitle>
          <div className="flex w-full sm:w-auto gap-2 items-center">
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input id="partyCollectionSearch" aria-label="Search party collection" className="pl-9" placeholder="Search party..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="text-xs gap-1.5 whitespace-nowrap">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
          {message ? <p className="mb-3 text-sm text-emerald-600">{message}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party Name</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Collected</TableHead>
                <TableHead className="text-right">Total Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleSummary.map((row) => (
                <TableRow
                  key={row.partyName}
                  className={cn("cursor-pointer", selectedParty === row.partyName && "bg-accent/70")}
                  onClick={() => void loadHistory(row.partyName)}
                >
                  <TableCell className="font-medium">{row.partyName}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.outstanding)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.collected)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.totalCredit)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record Collection</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Party Name" htmlFor="collectionPartyName">
            <Input id="collectionPartyName" value={form.partyName} onChange={(event) => setForm({ ...form, partyName: event.target.value })} />
          </Field>
          <Field label="Collection Date" htmlFor="collectionDate">
            <Input id="collectionDate" type="date" value={form.collectionDate} onChange={(event) => setForm({ ...form, collectionDate: event.target.value })} />
          </Field>
          <Field label="Cash" htmlFor="collectionCashPaid">
            <Input id="collectionCashPaid" value={form.cashPaid} onChange={(event) => setForm({ ...form, cashPaid: event.target.value })} />
          </Field>
          <Field label="Bank" htmlFor="collectionBankPaid">
            <Input id="collectionBankPaid" value={form.bankPaid} onChange={(event) => setForm({ ...form, bankPaid: event.target.value })} />
          </Field>
          <Field label="GPay" htmlFor="collectionGPayPaid">
            <Input id="collectionGPayPaid" value={form.gPayPaid} onChange={(event) => setForm({ ...form, gPayPaid: event.target.value })} />
          </Field>
          <Field label="Remarks" className="md:col-span-2" htmlFor="collectionRemarks">
            <Textarea id="collectionRemarks" value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Button onClick={() => void submit()}>
              <Save className="h-4 w-4" />
              Save Collection
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedParty ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedParty} Collection History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                  <TableHead className="text-right">Bank</TableHead>
                  <TableHead className="text-right">GPay</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{formatDate(row.collectionDate ?? row.createdAt)}</TableCell>
                    <TableCell className="number-cell">{formatCurrency(row.cashPaid)}</TableCell>
                    <TableCell className="number-cell">{formatCurrency(row.bankPaid)}</TableCell>
                    <TableCell className="number-cell">{formatCurrency(row.gPayPaid)}</TableCell>
                    <TableCell className="number-cell font-medium">{formatCurrency(row.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function OtherCreditPage() {
  const { promptPassword, confirmAction } = usePrompt();
  const [rows, setRows] = useState<OtherCreditRow[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(() => blankOtherForm());
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  

  const load = useCallback(async () => {
    setRows((await listOtherCredits(search)) as OtherCreditRow[]);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  function startCreate() {
    setForm(blankOtherForm());
    setShowForm(true);
    setError("");
    setMessage("");
  }

  function startEdit(row: OtherCreditRow) {
    setForm({
      id: row.id,
      name: row.name,
      amount: String(row.amount),
      reason: row.reason ?? "",
      expectedDueDate: dateInput(row.expectedDueDate),
      status: row.status,
    });
    setShowForm(true);
    setError("");
    setMessage("");
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      await saveOtherCredit(form);
      setMessage(form.id ? "Other credit updated." : "Other credit added.");
      setForm(blankOtherForm());
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction("Delete this other credit record?"))) return;
    const password = await promptPassword("Enter delete PIN:");
    if (!password || !(await verifyEditPassword(password, "delete"))) {
      setError("❌ Incorrect Delete PIN. Delete cancelled.");
      return;
    }
    setError("");
    try {
      const res = await deleteOtherCredit(id, password);
      if (res && !res.success) {
        setError(res.error || "Delete failed.");
        return;
      }
      if (form.id === id) setForm(blankOtherForm());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  function handleExportExcel() {
    if (rows.length === 0) return;
    
    let totalAmount = 0;

    const excelData = rows.map(row => {
      totalAmount += row.amount;
      return {
        Name: row.name,
        Amount: row.amount,
        Reason: row.reason || "-",
        "Expected Due Date": row.expectedDueDate ? formatDate(row.expectedDueDate) : "-",
        Status: row.status
      };
    });
    
    excelData.push({
      Name: "TOTAL",
      Amount: totalAmount,
      Reason: "",
      "Expected Due Date": "",
      Status: ""
    });

    exportToExcel(excelData, `Other_Credit_${new Date().toISOString().slice(0,10)}`);
  }

  return (
    <div className="space-y-5 p-4 lg:p-6 print:p-0 print:space-y-0 print:max-w-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Other Credit</h1>
          <p className="text-sm text-muted-foreground">General/Other credit records not linked to standard customers.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportExcel} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button variant="outline" onClick={() => handlePrint()} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <div className="hidden print:block mb-8 text-center border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">MBM QUARRY</h1>
        <p className="text-muted-foreground text-sm uppercase tracking-wider mt-1">Other Credit List</p>
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

      <Card className="print:border-none print:shadow-none">
        <CardContent className="grid gap-4 pt-5 print:p-0">
          <div className="relative print:hidden">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input id="otherCreditSearch" aria-label="Search other credit" className="pl-9" placeholder="Search other credit..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          {showForm ? (
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-medium">{form.id ? "Edit Other Credit" : "New Other Credit"}</div>
                <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} aria-label="Close form">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Name" htmlFor="otherCreditName">
                  <Input id="otherCreditName" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
                </Field>
                <Field label="Amount" htmlFor="otherCreditAmount">
                  <Input
                    id="otherCreditAmount"
                    className="text-right tabular-nums"
                    type="number"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                  />
                </Field>
                <Field label="Expected Due Date" htmlFor="otherCreditDueDate">
                  <Input
                    id="otherCreditDueDate"
                    type="date"
                    value={form.expectedDueDate}
                    onChange={(event) => setForm((current) => ({ ...current, expectedDueDate: event.target.value }))}
                  />
                </Field>
                <Field label="Status" htmlFor="otherCreditStatus">
                  <select
                    id="otherCreditStatus"
                    aria-label="Status"
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </Field>
                <Field label="Reason" className="md:col-span-2 xl:col-span-4" htmlFor="otherCreditReason">
                  <Textarea id="otherCreditReason" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
                </Field>
              </div>
              <div className="mt-4">
                <Button onClick={() => void submit()}>
                  <Save className="h-4 w-4" />
                  {form.id ? "Save Changes" : "Create"}
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive print:hidden">{error}</p> : null}
          {message ? <p className="text-sm text-success print:hidden">{message}</p> : null}

          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-[350px])] sm:max-h-[60vh] rounded-md border print:border-none print:overflow-visible print:max-h-none">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm print:bg-transparent print:border-b-2 print:border-black print:relative print:shadow-none">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Expected Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="print:border-b print:border-gray-200">
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="max-w-64 truncate print:whitespace-normal">{row.reason}</TableCell>
                  <TableCell>{row.expectedDueDate ? formatDate(row.expectedDueDate) : "-"}</TableCell>
                  <TableCell className="capitalize">{row.status}</TableCell>
                  <TableCell className="text-right print:hidden">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(row)} aria-label="Edit other credit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete other credit">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No other credit records found.
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

