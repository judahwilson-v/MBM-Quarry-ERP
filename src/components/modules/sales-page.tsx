"use client";
import { usePrompt } from "@/components/ui/prompt-provider";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Pencil, Search, Shield, Trash2 } from "lucide-react";
import { SalesEntryForm, type EditableSale } from "@/components/modules/sales-entry-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteSale, listSales, purgeNonGstSales } from "@/lib/offline-actions";
import { verifyEditPassword } from "@/lib/domain";
import { cn, formatCurrency, formatDate, formatQty } from "@/lib/utils";

type SaleRow = EditableSale & {
  amount: number;
  finalAmount: number;
  gstEnabled?: boolean;
  gstAmount?: number;
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
  const [gstFilter, setGstFilter] = useState<"ALL" | "GST" | "NON_GST">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("saleDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const { promptPassword, confirmAction } = usePrompt();

  const loadSales = useCallback(async () => {
    const rows = (await listSales()) as unknown as SaleRow[];
    setSales(rows);
  }, []);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  const visibleRows = useMemo(() => {
    let filtered = sales;
    if (gstFilter === "GST") filtered = filtered.filter(row => row.gstEnabled);
    if (gstFilter === "NON_GST") filtered = filtered.filter(row => !row.gstEnabled);

    const query = search.trim().toLowerCase();
    filtered = query
      ? filtered.filter((row) =>
          [
        row.saleDate,
            row.vehicleNumber,
            row.partyName,
            row.materialName,
            row.qty,
            row.ratePerCft,
            row.finalAmount,
            row.remarks,
          ]
            .join(" ")
            .toLowerCase()
            .includes(query),
        )
      : sales;

    return [...filtered].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const result =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left ?? "").localeCompare(String(right ?? ""));
      return sortDirection === "asc" ? result : -result;
    });
  }, [sales, search, gstFilter, sortDirection, sortKey]);

  const summary = useMemo(() => {
    const result: Record<string, number> = { totalRevenue: 0 };
    for (const material of materialTotals) result[material] = 0;
    for (const row of visibleRows) {
      result.totalRevenue += Number(row.finalAmount ?? 0);
      if (row.materialName in result) result[row.materialName] += Number(row.qty ?? 0);
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
    const password = await promptPassword("Enter delete password:");
    if (!password || !verifyEditPassword(password)) {
      setError("Delete password is invalid.");
      return;
    }
    setError("");
    try {
      await deleteSale(id);
      if (editingSale?.id === id) setEditingSale(null);
      await loadSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function raidPurge() {
    if (!(await confirmAction("\u26a0\ufe0f RAID MODE: Delete ALL non-GST sales? Only GST sales will remain. This cannot be undone."))) return;
    setError("");
    try {
      const count = await purgeNonGstSales();
      setEditingSale(null);
      await loadSales();
      setError("");
      alert(`Purge complete. ${count} non-GST sale(s) deleted. Only GST sales remain.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purge failed.");
    }
  }

  // Keyboard shortcut: Ctrl+D for raid purge
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void raidPurge();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Outgoing Sales</h1>
        <p className="text-sm text-muted-foreground">Local sales entry, serial register, and material totals.</p>
      </div>

      <SalesEntryForm
        editingSale={editingSale}
        onSaved={() => {
          setEditingSale(null);
          void loadSales();
        }}
        onCancelEdit={() => setEditingSale(null)}
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CardTitle>Sales Table</CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 text-xs gap-1.5"
              onClick={() => void raidPurge()}
              title="Ctrl+D — Delete all non-GST sales"
            >
              <Shield className="h-3.5 w-3.5" />
              Purge Non-GST
            </Button>
          </div>
          <div className="flex w-full sm:w-auto gap-2 items-center">
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
        <CardContent className="grid gap-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>GST</TableHead>
                <SortableHead label="Date" active={sortKey === "saleDate"} onClick={() => sortBy("saleDate")} />
                <TableHead>Time</TableHead>
                <SortableHead label="Vehicle" active={sortKey === "vehicleNumber"} onClick={() => sortBy("vehicleNumber")} />
                <SortableHead label="Party" active={sortKey === "partyName"} onClick={() => sortBy("partyName")} />
                <SortableHead label="Material" active={sortKey === "materialName"} onClick={() => sortBy("materialName")} />
                <SortableHead label="Qty" active={sortKey === "qty"} alignRight onClick={() => sortBy("qty")} />
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <SortableHead label="Final" active={sortKey === "finalAmount"} alignRight onClick={() => sortBy("finalAmount")} />
                <TableHead>Remarks</TableHead>
                <TableHead>Book/Page</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id} className={cn(editingSale?.id === row.id && "bg-accent/70", row.gstEnabled && "bg-red-50 hover:bg-red-100")}>
                  <TableCell>
                    {row.gstEnabled ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm ring-2 ring-red-400/50 animate-pulse">
                        GST
                        <span className="text-[10px] font-normal opacity-90">{formatCurrency(row.gstAmount ?? 0)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>{formatDate(row.saleDate)}</TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell>{row.vehicleNumber}</TableCell>
                  <TableCell>{row.partyName}</TableCell>
                  <TableCell>{row.materialName}</TableCell>
                  <TableCell className="number-cell">{formatQty(row.qty, "")}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.ratePerCft)}</TableCell>
                  <TableCell className="number-cell">{formatCurrency(row.amount)}</TableCell>
                  <TableCell className="number-cell">
                    {row.discountType === "percentage" ? `${row.discountValue}%` : formatCurrency(row.discountValue)}
                  </TableCell>
                  <TableCell className="number-cell font-medium">{formatCurrency(row.finalAmount)}</TableCell>
                  <TableCell className="max-w-44 truncate">{row.remarks}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {row.bookNumber && row.pageNumber ? `${row.bookNumber}/${row.pageNumber}` : row.bookNumber || row.pageNumber || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          const password = await promptPassword("Enter edit password:");
                          if (!password || !verifyEditPassword(password)) {
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
                  <TableCell colSpan={14} className="h-24 text-center text-muted-foreground">
                    No sales found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="grid gap-2 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryLine label="Total Revenue" value={formatCurrency(summary.totalRevenue)} strong />
            {materialTotals.map((material) => (
              <SummaryLine key={material} label={`Total ${material}`} value={formatQty(summary[material] ?? 0)} />
            ))}
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
}: {
  label: string;
  active: boolean;
  alignRight?: boolean;
  onClick: () => void;
}) {
  return (
    <TableHead className={alignRight ? "text-right" : undefined}>
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

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm", strong && "font-semibold")}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
