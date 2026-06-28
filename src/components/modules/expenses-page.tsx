"use client";
import { usePrompt } from "@/components/ui/prompt-provider";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Pencil, Search, Trash2 } from "lucide-react";
import { ExpenseEntryForm, type EditableExpense } from "@/components/modules/expense-entry-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { deleteExpense, listExpenses } from "@/lib/offline-actions";
import { verifyEditPassword } from "@/lib/domain";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type ExpenseRow = EditableExpense & {
  createdAt: string;
};

type SortKey = "expenseDate" | "expenseType" | "amount" | "paymentMode" | "partyName" | "vehicleNumber";

export function ExpensesPage() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("expenseDate");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const { promptPassword, confirmAction } = usePrompt();

  const loadExpenses = useCallback(async () => {
    try {
      const rows = (await listExpenses()) as unknown as ExpenseRow[];
      setExpenses(rows);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? expenses.filter((row) =>
          [row.expenseDate, row.expenseType, row.amount, row.paymentMode, row.partyName, row.vehicleNumber, row.description]
            .join(" ")
            .toLowerCase()
            .includes(query)
        )
      : expenses;

    return [...filtered].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      const result = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left ?? "").localeCompare(String(right ?? ""));
      return sortDirection === "asc" ? result : -result;
    });
  }, [expenses, search, sortDirection, sortKey]);

  function sortBy(key: SortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction("Delete this expense?"))) return;
    const password = await promptPassword("Enter delete password:");
    if (!password || !verifyEditPassword(password)) {
      setError("Delete password is invalid.");
      return;
    }
    setError("");
    try {
      await deleteExpense(id);
      if (editingExpense?.id === id) setEditingExpense(null);
      await loadExpenses();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Expenses</h1>
        <p className="text-sm text-muted-foreground">Manage all quarry expenses like fuel, salary, maintenance, and purchases.</p>
      </div>

      <ExpenseEntryForm
        editingExpense={editingExpense}
        onSaved={() => {
          setEditingExpense(null);
          void loadExpenses();
        }}
        onCancelEdit={() => setEditingExpense(null)}
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>Expense Register</CardTitle>
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search expenses..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Date" active={sortKey === "expenseDate"} onClick={() => sortBy("expenseDate")} />
                <SortableHead label="Type" active={sortKey === "expenseType"} onClick={() => sortBy("expenseType")} />
                <SortableHead label="Amount" active={sortKey === "amount"} alignRight onClick={() => sortBy("amount")} />
                <SortableHead label="Payment Mode" active={sortKey === "paymentMode"} onClick={() => sortBy("paymentMode")} />
                <SortableHead label="Party" active={sortKey === "partyName"} onClick={() => sortBy("partyName")} />
                <SortableHead label="Vehicle" active={sortKey === "vehicleNumber"} onClick={() => sortBy("vehicleNumber")} />
                <TableHead>Description</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => (
                <TableRow key={row.id} className={cn(editingExpense?.id === row.id && "bg-accent/70")}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.expenseDate)}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                      {row.expenseType}
                    </span>
                  </TableCell>
                  <TableCell className="number-cell font-medium text-destructive">{formatCurrency(row.amount)}</TableCell>
                  <TableCell>{row.paymentMode}</TableCell>
                  <TableCell>{row.partyName || "-"}</TableCell>
                  <TableCell>{row.vehicleNumber || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={row.description ?? ""}>{row.description}</TableCell>
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
                          setEditingExpense(row);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!visibleRows.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No expenses found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
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
