"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadSimplePdf } from "@/lib/export-utils";
import { formatDate, formatQty, todayInputValue } from "@/lib/utils";

export function ReconciliationPage() {
  const [parties, setParties] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [form, setForm] = useState({
    partyId: "",
    name: "",
    date: todayInputValue(),
    rows: [{ description: "", rateQty: "", multiplier: 1 }],
  });
  const [message, setMessage] = useState("");

  async function load() {
    const [partyBody, groupBody] = await Promise.all([
      fetch("/api/v1/parties?pageSize=100").then((response) => response.json()),
      fetch(`/api/v1/reconciliation${form.partyId ? `?partyId=${form.partyId}` : ""}`).then((response) => response.json()),
    ]);
    setParties(partyBody.data ?? []);
    setGroups(groupBody.data ?? []);
  }

  useEffect(() => {
    void load();
  }, [form.partyId]);

  const totalQty = useMemo(
    () => form.rows.reduce((sum, row) => sum + Number(row.rateQty || 0) * Number(row.multiplier || 0), 0),
    [form.rows],
  );

  function updateRow(index: number, key: string, value: any) {
    setForm((current) => ({
      ...current,
      rows: current.rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)),
    }));
  }

  async function submit() {
    const response = await fetch("/api/v1/reconciliation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error ?? "Save failed.");
      return;
    }
    setMessage("Reconciliation group saved.");
    setForm((current) => ({ ...current, name: "", rows: [{ description: "", rateQty: "", multiplier: 1 }] }));
    await load();
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Reconciliation</h1>
        <p className="text-sm text-muted-foreground">Manual truck quantity checks grouped by party and location.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Entry Form</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Party">
              <SearchableSelect
                value={form.partyId}
                placeholder="Select party"
                options={parties.map((party) => ({ value: party.id, label: party.name, description: party.phone }))}
                onChange={(value) => setForm((current) => ({ ...current, partyId: value }))}
              />
            </Field>
            <Field label="Group name">
              <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </Field>
            <Field label="Date">
              <Input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} />
            </Field>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Rate Qty</TableHead>
                <TableHead className="text-right">Multiplier</TableHead>
                <TableHead className="text-right">Total Qty</TableHead>
                <TableHead className="w-16"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {form.rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input value={row.description} onChange={(event) => updateRow(index, "description", event.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input className="text-right" type="number" value={row.rateQty} onChange={(event) => updateRow(index, "rateQty", event.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input className="text-right" type="number" value={row.multiplier} onChange={(event) => updateRow(index, "multiplier", Number(event.target.value))} />
                  </TableCell>
                  <TableCell className="number-cell font-medium">{formatQty(Number(row.rateQty || 0) * Number(row.multiplier || 0))}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => setForm((current) => ({ ...current, rows: current.rows.filter((_, i) => i !== index) }))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setForm((current) => ({ ...current, rows: [...current.rows, { description: "", rateQty: "", multiplier: 1 }] }))}>
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
            <div className="text-lg font-semibold">Party Total Qty: {formatQty(totalQty)}</div>
          </div>
          {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          <Button className="w-fit" onClick={() => void submit()}>Save Group</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Past Groups</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {groups.map((group) => {
            const total = group.rows.reduce((sum: number, row: any) => sum + Number(row.totalQty), 0);
            return (
              <div key={group.id} className="rounded-md border p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">{group.name}</div>
                    <div className="text-sm text-muted-foreground">{group.party?.name} / {formatDate(group.date)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{formatQty(total)}</span>
                    <Button variant="outline" size="sm" onClick={() => void downloadSimplePdf({ title: group.name, rows: group.rows, fileName: `${group.name}.pdf` })}>
                      PDF
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
