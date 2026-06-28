"use client";
import { usePrompt } from "@/components/ui/prompt-provider";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  deleteParty,
  deleteVehicle,
  listParties,
  listVehicles,
  saveParty,
  saveVehicle,
} from "@/lib/offline-actions";
import { verifyEditPassword } from "@/lib/domain";

type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea";
  required?: boolean;
};

type MasterRecord = {
  id: string;
  [key: string]: string | number | Date | null | undefined;
};

type MasterFormValue = string | number | null | undefined;

type MasterDataPageProps = {
  resource: "parties" | "vehicles";
  title: string;
  description: string;
  fields: FieldConfig[];
  columns: Array<{ key: string; label: string; format?: (row: MasterRecord) => string }>;
};

export function MasterDataPage({ resource, title, description, fields, columns }: MasterDataPageProps) {
  const [rows, setRows] = useState<MasterRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<MasterRecord | null>(null);
  const [form, setForm] = useState<Record<string, MasterFormValue>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const { promptPassword, confirmAction } = usePrompt();
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const data = resource === "vehicles" ? await listVehicles(search) : await listParties(search);
    setRows(data as unknown as MasterRecord[]);
    setLoading(false);
  }, [resource, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(timer);
  }, [load]);

  function startCreate() {
    setEditing(null);
    setForm(Object.fromEntries(fields.map((field) => [field.name, ""])));
    setMessage("");
    setError("");
  }

  function startEdit(row: MasterRecord) {
    setEditing(row);
    setForm(row as unknown as Record<string, MasterFormValue>);
    setMessage("");
    setError("");
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      if (resource === "vehicles") {
        const companyBodyQty = form["companyBodyQty"];
        const extraBodyQty = form["extraBodyQty"];
        await saveVehicle({
          id: editing?.id,
          vehicleNumber: String(form.vehicleNumber ?? ""),
          partyName: form["partyName"] ? String(form["partyName"]) : null,
          companyBodyQty: companyBodyQty === "" || companyBodyQty == null ? null : Number(companyBodyQty),
          extraBodyQty: extraBodyQty === "" || extraBodyQty == null ? null : Number(extraBodyQty),
        });
      } else {
        await saveParty({
          id: editing?.id,
          partyName: String(form["partyName"] ?? ""),
          phone: form["phone"] ? String(form["phone"]) : null,
          address: form["address"] ? String(form["address"]) : null,
        });
      }
      setEditing(null);
      setForm({});
      setMessage(editing ? "Record updated." : "Record added.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction("Delete this record?"))) return;
    const password = await promptPassword("Enter delete password:");
    if (!password || !verifyEditPassword(password)) {
      setError("Delete password is invalid.");
      return;
    }
    setError("");
    try {
      if (resource === "vehicles") {
        await deleteVehicle(id);
      } else {
        await deleteParty(id);
      }
      setMessage("Record deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder={`Search ${title.toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          {Object.keys(form).length ? (
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {fields.map((field) => (
                  <Field key={field.name} label={field.label}>
                    {renderField(field, form[field.name], (value) => setForm((current) => ({ ...current, [field.name]: value })))}
                  </Field>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button onClick={() => void submit()}>{editing ? "Save Changes" : "Create"}</Button>
                <Button variant="outline" onClick={() => setForm({})}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {column.format ? column.format(row) : String(readPath(row, column.key) ?? "")}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(row)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void remove(row.id)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="h-24 text-center text-muted-foreground">
                    {loading ? "Loading..." : "No records found."}
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

function renderField(field: FieldConfig, value: MasterFormValue, onChange: (value: MasterFormValue) => void) {
  if (field.type === "textarea") {
    return <Textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} />;
  }
  return (
    <Input
      className={field.type === "number" ? "text-right tabular-nums" : undefined}
      type={field.type === "number" ? "number" : "text"}
      step={field.type === "number" ? "0.001" : undefined}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      required={field.required}
    />
  );
}

function readPath(row: MasterRecord, path: string) {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, row);
}
