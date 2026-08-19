"use client";
import { usePrompt } from "@/components/ui/prompt-provider";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Pencil, Search, Shield, Trash2, Printer, Download } from "lucide-react";
import { SalesEntryForm, type EditableSale } from "@/components/modules/sales-entry-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineEditableCell } from "@/components/ui/inline-editable-cell";
import { deleteSale, listSales, purgeNonGstSales, saveSale } from "@/app/actions/sales";
import { verifyEditPassword } from "@/app/actions/auth";
import { cn, formatCurrency, formatDate, formatQty } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import { handlePrint } from "@/lib/utils/print";

type SaleRow = EditableSale & {
  amount: number;
  finalAmount: number;
  gstEnabled?: boolean;
  gstAmount?: number;
  paidTotal?: number;
  remainingCredit?: number;
  createdAt: string;
};

type SortKey =
  | "saleDate"
  | "vehicleNumber"
  | "partyName"
  | "materialName"
  | "qty"
  | "finalAmount";

const materialTotals = ["MSAND", "6 MM", "12 MM", "20 MM", "40 MM", "DUST", "GSB"];

export function SalesPage() {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [editingSale, setEditingSale] = useState<SaleRow | null>(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [gstFilter, setGstFilter] = useState<"ALL" | "GST" | "NON_GST">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("saleDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const { promptPassword, confirmAction } = usePrompt();

  const [activeCell, setActiveCell] = useState<{rowId: string, colKey: string} | null>(null);
  const [pinCache, setPinCache] = useState<{pin: string, expires: number} | null>(null);

  async function requestEditPin(): Promise<string | null> {
    if (pinCache && pinCache.expires > Date.now()) {
      return pinCache.pin;
    }
    const password = await promptPassword("Enter Edit PIN (caches for 15m):");
    if (!password) return null;
    const isAuth = await verifyEditPassword(password, "edit");
    if (!isAuth) {
      setError("❌ Incorrect PIN.");
      return null;
    }
    setPinCache({ pin: password, expires: Date.now() + 15 * 60 * 1000 });
    setError("");
    return password;
  }

  async function handleInlineSave(row: SaleRow, field: keyof EditableSale, newValue: string) {
    if (String(row[field as keyof SaleRow] ?? "") === newValue) return true;
    
    const pin = await requestEditPin();
    if (!pin) return false;

    const input: any = {
      id: row.id,
      saleDate: row.saleDate,
      vehicleNumber: row.vehicleNumber,
      partyName: row.partyName,
      materialId: (row as any).materialId,
      qty: row.qty,
      ratePerCft: row.ratePerCft,
      cashPaid: row.cashPaid,
      bankPaid: row.bankPaid,
      gPayPaid: row.gPayPaid,
      discountType: row.discountType,
      discountValue: row.discountValue,
      remarks: row.remarks,
    };
    
    const numFields = ["qty", "ratePerCft", "cashPaid", "bankPaid", "gPayPaid", "discountValue"];
    input[field] = numFields.includes(field) ? Number(newValue) : newValue;

    try {
      const res = await saveSale(input, pin);
      if (res.success) {
        await loadSales();
        return true;
      }
      setError(res.error || "Failed to update cell.");
      return false;
    } catch (e: any) {
      setError(e.message || "Failed to update cell.");
      return false;
    }
  }

  const editableCols = ["saleDate", "vehicleNumber", "partyName", "qty", "ratePerCft", "discountValue", "cashPaid", "bankPaid", "remarks"];

  function handleNavigate(dir: "up" | "down" | "left" | "right" | "next" | "prev", rowId: string, colKey: string) {
    const rowIdx = visibleRows.findIndex(r => r.id === rowId);
    const colIdx = editableCols.indexOf(colKey);
    if (rowIdx === -1 || colIdx === -1) return;

    let nextRow = rowIdx;
    let nextCol = colIdx;

    if (dir === "up") nextRow = Math.max(0, rowIdx - 1);
    if (dir === "down") nextRow = Math.min(visibleRows.length - 1, rowIdx + 1);
    if (dir === "left" || dir === "prev") {
      if (colIdx > 0) nextCol = colIdx - 1;
      else if (rowIdx > 0) { nextCol = editableCols.length - 1; nextRow = rowIdx - 1; }
    }
    if (dir === "right" || dir === "next") {
      if (colIdx < editableCols.length - 1) nextCol = colIdx + 1;
      else if (rowIdx < visibleRows.length - 1) { nextCol = 0; nextRow = rowIdx + 1; }
    }

    setActiveCell({ rowId: visibleRows[nextRow].id, colKey: editableCols[nextCol] });
  }

  const loadSales = useCallback(async () => {
    const rows = (await listSales()) as SaleRow[];
    setSales(rows);
  }, []);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const visibleRows = useMemo(() => {
    let filtered = sales;
    if (gstFilter === "GST") filtered = filtered.filter(row => row.gstEnabled);
    if (gstFilter === "NON_GST") filtered = filtered.filter(row => !row.gstEnabled);
    if (dateFilter) filtered = filtered.filter(row => row.saleDate && row.saleDate.startsWith(dateFilter));

    const query = search.trim().toLowerCase();
    filtered = query
      ? filtered.filter((row) =>
          [
            row.saleDate,
            row.vehicleNumber,
            row.partyName,
            row?.materialName,
            row.qty,
            row.ratePerCft,
            row.finalAmount,
            row.remarks,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : filtered;

    return [...filtered].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const result =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left ?? "").localeCompare(String(right ?? ""));
      return sortDirection === "asc" ? result : -result;
    });
  }, [sales, search, dateFilter, gstFilter, sortDirection, sortKey]);

  const summary = useMemo(() => {
    const result: Record<string, number> = { totalRevenue: 0 };
    for (const material of materialTotals) result[material] = 0;
    for (const row of visibleRows) {
      result.totalRevenue += Number(row.finalAmount ?? 0);
      if (row?.materialName && row.materialName in result) result[row.materialName] += Number(row.qty ?? 0);
    }
    return result;
  }, [visibleRows]);

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction("Delete this sale?"))) return;
    const password = await promptPassword("Enter delete PIN:");
    if (!password || !(await verifyEditPassword(password, "delete"))) {
      setError("❌ Incorrect Delete PIN. Delete cancelled.");
      return;
    }
    setError("");
    try {
      const res = await deleteSale(id, password);
      if (res.success) {
        if (editingSale?.id === id) setEditingSale(null);
        await loadSales();
      } else {
        setError(res.error || "Delete failed.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function raidPurge() {
    if (!(await confirmAction("⚠️ RAID MODE: Delete ALL non-GST sales? Only GST sales will remain. This cannot be undone."))) return;
    const password = await promptPassword("Enter delete PIN:");
    if (!password || !(await verifyEditPassword(password, "delete"))) {
      setError("❌ Incorrect Delete PIN. Purge cancelled.");
      return;
    }
    setError("");
    try {
      const res = await purgeNonGstSales(password);
      if (!res.success) {
        setError(res.error || "Purge failed.");
        return;
      }
      setEditingSale(null);
      await loadSales();
      setError("");
      alert(`Purge complete. ${res.count} non-GST sale(s) deleted. Only GST sales remain.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purge failed.");
    }
  }

  function handleExportExcel() {
    if (visibleRows.length === 0) return;
    
    const excelData: Record<string, any>[] = visibleRows.map((row) => ({
      Date: formatDate(row.saleDate),
      Time: new Date(row.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      Vehicle: row.vehicleNumber,
      Party: row.partyName,
      Material: row.materialName,
      Qty: row.qty,
      Rate: row.ratePerCft,
      Amount: row.amount,
      Discount: row.discountType === "percentage" ? `${row.discountValue}%` : row.discountValue,
      "Final Amount": row.finalAmount,
      "Cash Paid": row.cashPaid ?? 0,
      "Bank/GPay": (row.bankPaid ?? 0) + (row.gPayPaid ?? 0),
      "Paid Total": row.paidTotal ?? 0,
      "Credit": row.remainingCredit ?? 0,
      Remarks: row.remarks || "-",
      "Book/Page": row.bookNumber && row.pageNumber ? `${row.bookNumber}/${row.pageNumber}` : row.bookNumber || row.pageNumber || "-"
    }));
    
    excelData.push({
      Date: "TOTAL REVENUE",
      Time: "",
      Vehicle: "",
      Party: "",
      Material: "",
      Qty: "",
      Rate: "",
      Amount: "",
      Discount: "",
      "Final Amount": summary.totalRevenue,
      "Cash Paid": "",
      "Bank/GPay": "",
      "Paid Total": "",
      "Credit": "",
      Remarks: "",
      "Book/Page": ""
    });

    exportToExcel(excelData, `Sales_Report_${new Date().toISOString().slice(0,10)}`);
  }

  return (
    <div className="space-y-5 p-4 lg:p-6 print:p-0 print:space-y-0 print:max-w-none">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-normal">Outgoing Sales</h1>
        <p className="text-sm text-muted-foreground">Local sales entry, serial register, and material totals.</p>
      </div>

      <div className="print:hidden">
        <SalesEntryForm
          editingSale={editingSale}
          onSaved={() => {
            setEditingSale(null);
            void loadSales();
          }}
          onCancelEdit={() => setEditingSale(null)}
        />
      </div>

      <div className="hidden print:block mb-8 text-center border-b pb-4">
        <h1 className="text-3xl font-bold tracking-tight">MBM QUARRY</h1>
        <p className="text-muted-foreground text-sm uppercase tracking-wider mt-1">Sales Report</p>
        <div className="mt-6 flex justify-between items-end text-left">
          <div>
            <p className="text-sm text-muted-foreground">Report Date</p>
            <h2 className="text-xl font-bold" suppressHydrationWarning>{new Date().toLocaleDateString('en-IN')}</h2>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Generated On</p>
            <p className="font-medium" suppressHydrationWarning>{new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>

      <Card className="print:border-none print:shadow-none">
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <CardTitle>Sales Table</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 text-xs gap-1.5"
              onClick={() => void raidPurge()}
              title="Purge all non-GST sales"
            >
              <Shield className="h-3.5 w-3.5" />
              Purge Non-GST
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="text-xs gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => handlePrint()} className="text-xs gap-1.5">
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
          <div className="flex w-full sm:w-auto gap-2 items-center flex-wrap">
            <Input 
              type="date" 
              className="w-auto h-10" 
              value={dateFilter} 
              onChange={(e) => setDateFilter(e.target.value)} 
              title="Filter by date"
            />
            <select
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={gstFilter}
              onChange={(e) => setGstFilter(e.target.value as any)}
            >
              <option value="ALL">All Sales</option>
              <option value="GST">GST Sales</option>
              <option value="NON_GST">Non-GST</option>
            </select>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search sales..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 print:p-0">
          {error ? <p className="text-sm text-destructive print:hidden">{error}</p> : null}
          <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-[350px])] sm:max-h-[60vh] rounded-md border print:border-none print:overflow-visible print:max-h-none">
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10 shadow-sm print:bg-transparent print:border-b-2 print:border-black print:relative print:shadow-none">
              <TableRow>
                <SortableHead className="sm:sticky sm:left-0 z-20 bg-muted w-[110px] min-w-[110px] max-w-[110px] sm:border-r border-border print:static print:w-auto print:border-none" label="Date" active={sortKey === "saleDate"} onClick={() => sortBy("saleDate")} />
                <TableHead>Time</TableHead>
                <SortableHead label="Vehicle" active={sortKey === "vehicleNumber"} onClick={() => sortBy("vehicleNumber")} />
                <SortableHead label="Party" active={sortKey === "partyName"} onClick={() => sortBy("partyName")} />
                <SortableHead label="Material" active={sortKey === "materialName"} onClick={() => sortBy("materialName")} />
                <SortableHead label="Qty" active={sortKey === "qty"} alignRight onClick={() => sortBy("qty")} />
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right print:hidden">Discount</TableHead>
                <SortableHead label="Final" active={sortKey === "finalAmount"} alignRight onClick={() => sortBy("finalAmount")} />
                <TableHead className="text-right">Cash</TableHead>
                <TableHead className="text-right">Bank/GPay</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="print:hidden">Remarks</TableHead>
                <TableHead className="print:hidden">Book/Page</TableHead>
                <TableHead className="w-24 text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id} className={cn(
                  editingSale?.id === row.id && "bg-accent",
                  row.gstEnabled ? "bg-red-50 hover:bg-red-100 dark:bg-red-950 dark:hover:bg-red-900" : "bg-background hover:bg-muted",
                  "print:border-b print:border-gray-200 group"
                )}>
                  <TableCell className="sm:sticky sm:left-0 z-10 bg-inherit w-[110px] min-w-[110px] max-w-[110px] sm:border-r border-border print:static print:w-auto print:border-none">
                    <InlineEditableCell rowId={row.id} colKey="saleDate" value={row.saleDate} displayValue={formatDate(row.saleDate)} type="date" activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "saleDate", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "saleDate")} />
                  </TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell>
                    <InlineEditableCell rowId={row.id} colKey="vehicleNumber" value={row.vehicleNumber} activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "vehicleNumber", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "vehicleNumber")} />
                  </TableCell>
                  <TableCell className="truncate max-w-[150px]" title={row.partyName}>
                    <InlineEditableCell rowId={row.id} colKey="partyName" value={row.partyName} activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "partyName", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "partyName")} />
                  </TableCell>
                  <TableCell>{row.materialName}</TableCell>
                  <TableCell className="number-cell font-medium text-emerald-700 dark:text-emerald-400">
                    <InlineEditableCell rowId={row.id} colKey="qty" value={row.qty} displayValue={formatQty(row.qty, "")} type="number" activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "qty", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "qty")} />
                  </TableCell>
                  <TableCell className="number-cell">
                    <InlineEditableCell rowId={row.id} colKey="ratePerCft" value={row.ratePerCft} displayValue={formatCurrency(row.ratePerCft)} type="number" activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "ratePerCft", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "ratePerCft")} />
                  </TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="number-cell">
                    <InlineEditableCell rowId={row.id} colKey="discountValue" value={row.discountValue} displayValue={row.discountType === "percentage" ? `${row.discountValue}%` : formatCurrency(row.discountValue)} type="number" activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "discountValue", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "discountValue")} />
                  </TableCell>
                  <TableCell className="number-cell font-bold">{formatCurrency(row.finalAmount)}</TableCell>
                  <TableCell className="number-cell">
                    <InlineEditableCell rowId={row.id} colKey="cashPaid" value={row.cashPaid ?? 0} displayValue={(row.cashPaid ?? 0) > 0 ? formatCurrency(row.cashPaid ?? 0) : <span className="text-muted-foreground">—</span>} type="number" activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "cashPaid", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "cashPaid")} />
                  </TableCell>
                  <TableCell className="number-cell">
                    <InlineEditableCell rowId={row.id} colKey="bankPaid" value={row.bankPaid ?? 0} displayValue={((row.bankPaid ?? 0) + (row.gPayPaid ?? 0)) > 0 ? formatCurrency((row.bankPaid ?? 0) + (row.gPayPaid ?? 0)) : <span className="text-muted-foreground">—</span>} type="number" activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "bankPaid", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "bankPaid")} />
                  </TableCell>
                  <TableCell className="number-cell font-medium text-blue-600 dark:text-blue-400">{(row.paidTotal ?? 0) > 0 ? formatCurrency(row.paidTotal ?? 0) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className={cn("number-cell", (row.remainingCredit ?? 0) > 0 && "text-red-600 font-bold dark:text-red-400")}>{(row.remainingCredit ?? 0) > 0 ? formatCurrency(row.remainingCredit ?? 0) : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="max-w-44 truncate print:hidden" title={row.remarks || ""}>
                    <InlineEditableCell rowId={row.id} colKey="remarks" value={row.remarks || ""} activeCell={activeCell} setActiveCell={setActiveCell} onSave={(val) => handleInlineSave(row, "remarks", val)} onNavigate={(dir) => handleNavigate(dir, row.id, "remarks")} />
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground print:hidden">
                    {row.bookNumber && row.pageNumber ? `${row.bookNumber}/${row.pageNumber}` : row.bookNumber || row.pageNumber || "-"}
                  </TableCell>
                  <TableCell className="text-right print:hidden">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          const password = await promptPassword("Enter edit password:");
                          if (!password || !(await verifyEditPassword(password))) {
                            setError("Edit password is invalid.");
                            return;
                          }
                          setEditingSale(row);
                        }}
                        aria-label="Edit sale"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete sale">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!visibleRows.length ? (
                <TableRow>
                  <TableCell colSpan={17} className="h-24 text-center text-muted-foreground">
                    No sales found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          </div>

          <div className="grid gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-3 print:gap-4 print:border-black print:border-t-2">
            <SummaryLine label="Total Revenue" value={formatCurrency(summary.totalRevenue)} strong className="print:col-span-3 print:text-lg print:border-none print:px-0" />
            {materialTotals.map((material) => {
              if (summary[material] === 0) return null;
              return <SummaryLine key={material} label={`Total ${material}`} value={formatQty(summary[material] ?? 0)} className="print:border-none print:px-0" />;
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableHead({
  label,
  active,
  alignRight,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  alignRight?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <TableHead className={cn(alignRight ? "text-right" : "", className)}>
      <button
        type="button"
        className={cn("inline-flex items-center gap-1", alignRight && "justify-end")}
        onClick={onClick}
      >
        {label}
        <ArrowUpDown className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-50")} />
      </button>
    </TableHead>
  );
}

function SummaryLine({ label, value, strong = false, className }: { label: string; value: string; strong?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm", strong && "font-semibold", className)}>
      <span className="text-muted-foreground print:text-black">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
