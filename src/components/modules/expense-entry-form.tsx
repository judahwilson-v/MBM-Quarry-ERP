"use client";
import { usePrompt } from "@/components/ui/prompt-provider";

import { useCallback, useEffect, useState } from "react";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { listParties, listVehicles, saveExpense } from "@/lib/offline-actions";
import { verifyEditPassword } from "@/lib/domain";
import { todayInputValue } from "@/lib/utils";

export type EditableExpense = {
  id: string;
  expenseDate: string;
  expenseType: string;
  amount: number;
  paymentMode: string;
  partyId?: string | null;
  partyName?: string | null;
  vehicleId?: string | null;
  vehicleNumber?: string | null;
  description?: string | null;
};

type ExpenseForm = {
  id?: string;
  expenseDate: string;
  expenseType: string;
  amount: string;
  paymentMode: string;
  partyId: string;
  partyName: string;
  vehicleId: string;
  vehicleNumber: string;
  description: string;
};

function blankForm(): ExpenseForm {
  return {
    expenseDate: todayInputValue(),
    expenseType: "MISCELLANEOUS",
    amount: "",
    paymentMode: "CASH",
    partyId: "",
    partyName: "",
    vehicleId: "",
    vehicleNumber: "",
    description: "",
  };
}

export function ExpenseEntryForm({
  editingExpense,
  onSaved,
  onCancelEdit,
}: {
  editingExpense: EditableExpense | null;
  onSaved: () => void;
  onCancelEdit: () => void;
}) {
  const [form, setForm] = useState<ExpenseForm>(blankForm());
  const [parties, setParties] = useState<{ id: string; partyName: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; vehicleNumber: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { promptPassword } = usePrompt();
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [pRows, vRows] = await Promise.all([listParties(), listVehicles()]);
      setParties(pRows as any);
      setVehicles(vRows as any);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!editingExpense) {
      setForm(blankForm());
      return;
    }
    setForm({
      id: editingExpense.id,
      expenseDate: new Date(editingExpense.expenseDate).toISOString().split("T")[0],
      expenseType: editingExpense.expenseType,
      amount: String(editingExpense.amount),
      paymentMode: editingExpense.paymentMode,
      partyId: editingExpense.partyId ?? "",
      partyName: editingExpense.partyName ?? "",
      vehicleId: editingExpense.vehicleId ?? "",
      vehicleNumber: editingExpense.vehicleNumber ?? "",
      description: editingExpense.description ?? "",
    });
    setMessage("");
    setError("");
  }, [editingExpense]);

  function updateForm<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectParty(partyId: string) {
    const party = parties.find((row) => row.id === partyId);
    setForm((current) => ({
      ...current,
      partyId,
      partyName: party?.partyName ?? current.partyName,
    }));
  }

  function selectVehicle(vehicleId: string) {
    const vehicle = vehicles.find((row) => row.id === vehicleId);
    setForm((current) => ({
      ...current,
      vehicleId,
      vehicleNumber: vehicle?.vehicleNumber ?? current.vehicleNumber,
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (editingExpense) {
      const password = await promptPassword("Enter edit password to save changes:");
      if (!password || !verifyEditPassword(password)) {
        setError("Edit password is invalid.");
        return;
      }
    }
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await saveExpense(form);
      setMessage(editingExpense ? "Expense updated successfully." : "Expense saved successfully.");
      setForm(blankForm());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save expense.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={editingExpense ? "border-blue-500 shadow-md" : undefined}>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{editingExpense ? "Edit Expense" : "New Expense"}</CardTitle>
        {editingExpense && (
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            <X className="mr-2 h-4 w-4" /> Cancel Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void submit(e)} className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
            <Field label="Date">
              <Input
                type="date"
                required
                value={form.expenseDate}
                onChange={(e) => updateForm("expenseDate", e.target.value)}
              />
            </Field>

            <Field label="Expense Type">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.expenseType}
                onChange={(e) => updateForm("expenseType", e.target.value)}
                required
              >
                <option value="DIESEL">Diesel</option>
                <option value="GREASE_OIL">Grease Oil</option>
                <option value="HOUSE_EXPENSE">House Expense</option>
                <option value="LOCAL_EXPENSE">Local Expense</option>
                <option value="KSEB_BILL">KSEB Electricity Bill</option>
                <option value="PHONE_BILL">Phone Bill</option>
                <option value="LABOUR">Labour</option>
                <option value="REPAIRS">Repairs</option>
                <option value="LOADING">Loading</option>
                <option value="MISCELLANEOUS">Miscellaneous</option>
              </select>
            </Field>

            <Field label="Amount (₹)">
              <Input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => updateForm("amount", e.target.value)}
              />
            </Field>

            <Field label="Payment Mode">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.paymentMode}
                onChange={(e) => updateForm("paymentMode", e.target.value)}
                required
              >
                <option value="CASH">Cash</option>
                <option value="BANK">Bank</option>
                <option value="GPAY">GPay</option>
                <option value="CREDIT">Credit</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Link Party (Optional)</label>
              <div className="flex flex-col gap-2">
                <SearchableSelect
                  options={parties.map((p) => ({ label: p.partyName, value: p.id }))}
                  value={form.partyId}
                  onChange={selectParty}
                  placeholder="Search existing parties..."
                />
                <Input
                  placeholder="Or enter new party name..."
                  value={form.partyName}
                  onChange={(e) => {
                    updateForm("partyName", e.target.value);
                    if (form.partyId) updateForm("partyId", "");
                  }}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium">Link Vehicle (Optional)</label>
              <div className="flex flex-col gap-2">
                <SearchableSelect
                  options={vehicles.map((v) => ({ label: v.vehicleNumber, value: v.id }))}
                  value={form.vehicleId}
                  onChange={selectVehicle}
                  placeholder="Search existing vehicles..."
                />
                <Input
                  placeholder="Or enter new vehicle number..."
                  value={form.vehicleNumber}
                  onChange={(e) => {
                    updateForm("vehicleNumber", e.target.value.toUpperCase());
                    if (form.vehicleId) updateForm("vehicleId", "");
                  }}
                />
              </div>
            </div>

            <Field label="Description">
              <Textarea
                placeholder="Details about the expense..."
                value={form.description}
                onChange={(e) => updateForm("description", e.target.value)}
                className="resize-none"
              />
            </Field>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-green-600">{message}</p> : null}

          <div className="flex justify-end">
            <Button type="submit" disabled={loading} className="w-full sm:w-auto">
              <Save className="mr-2 h-4 w-4" /> {editingExpense ? "Update Expense" : "Save Expense"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
