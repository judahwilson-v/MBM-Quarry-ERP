"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, FileSpreadsheet, History, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadCsv, downloadExcel } from "@/lib/export-utils";
import { formatCurrency } from "@/lib/utils";

type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "checkbox" | "select";
  required?: boolean;
  readOnly?: boolean;
  options?: Array<{ label: string; value: string }>;
};

type MasterDataPageProps = {
  resource: "parties" | "vehicles" | "materials" | "drivers" | "suppliers" | "employees";
  title: string;
  description: string;
  fields: FieldConfig[];
  columns: Array<{ key: string; label: string; format?: (row: Record<string, any>) => string }>;
};

export function MasterDataPage({ resource, title, description, fields, columns }: MasterDataPageProps) {
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [editing, setEditing] = useState<Record<string, any> | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [historyRows, setHistoryRows] = useState<any[] | null>(null);
  const [selectOptions, setSelectOptions] = useState<Record<string, Array<{ label: string; value: string }>>>({});

  const resolvedFields = useMemo(
    () =>
      fields.map((field) => ({
        ...field,
        options: field.options ?? selectOptions[field.name] ?? [],
      })),
    [fields, selectOptions],
  );

  async function load() {
    setLoading(true);
    const params = new URLSearchParams({
      search,
      page: String(page),
      includeInactive: String(includeInactive),
    });
    const response = await fetch(`/api/v1/${resource}?${params.toString()}`);
    const body = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(body.error ?? "Failed to load records.");
      return;
    }
    setRows(body.data ?? []);
    setPageCount(body.meta?.pageCount ?? 1);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [search, includeInactive, page, resource]);

  useEffect(() => {
    async function loadOptions() {
      const next: Record<string, Array<{ label: string; value: string }>> = {};
      if (resource === "vehicles") {
        const body = await fetch("/api/v1/parties?pageSize=100").then((res) => res.json());
        next.partyId = (body.data ?? []).map((party: any) => ({ label: party.name, value: party.id }));
      }
      if (resource === "drivers") {
        const body = await fetch("/api/v1/vehicles?pageSize=100").then((res) => res.json());
        next.vehicleId = (body.data ?? []).map((vehicle: any) => ({ label: vehicle.vehicleNumber, value: vehicle.id }));
      }
      setSelectOptions(next);
    }
    void loadOptions();
  }, [resource]);

  function startCreate() {
    setEditing(null);
    setForm(Object.fromEntries(fields.map((field) => [field.name, field.type === "checkbox" ? field.name === "isActive" : ""])));
  }

  function startEdit(row: Record<string, any>) {
    setEditing(row);
    setForm(row);
  }

  async function submit() {
    setError("");
    const endpoint = editing ? `/api/v1/${resource}/${editing.id}` : `/api/v1/${resource}`;
    const response = await fetch(endpoint, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Save failed.");
      return;
    }
    setEditing(null);
    setForm({});
    await load();
  }

  async function softDelete(id: string) {
    if (!window.confirm("Soft-delete this record?")) return;
    const response = await fetch(`/api/v1/${resource}/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Delete failed.");
      return;
    }
    await load();
  }

  async function showHistory(id: string) {
    const response = await fetch(`/api/v1/materials/${id}/history`);
    const body = await response.json();
    setHistoryRows(body.data ?? []);
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
    const headers = headerLine.split(",").map((header) => header.trim());
    for (const line of lines) {
      const values = line.split(",").map((value) => value.trim());
      const payload = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const response = await fetch(`/api/v1/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json();
        setError(`CSV import stopped: ${body.error ?? "invalid row"}`);
        break;
      }
    }
    await load();
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={startCreate}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
          <Button variant="outline" onClick={() => void downloadExcel(rows, `${resource}.xlsx`, title)}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={() => downloadCsv(rows, `${resource}.csv`)}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border bg-background px-4 text-sm font-medium">
            <Upload className="h-4 w-4" />
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importCsv(file);
              }}
            />
          </label>
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search records..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Inactive records
            </label>
          </div>

          {Object.keys(form).length ? (
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {resolvedFields.map((field) => (
                  <Field key={field.name} label={field.label}>
                    {renderField(field, form[field.name], (value) => setForm((current) => ({ ...current, [field.name]: value })))}
                  </Field>
                ))}
              </div>
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
              <div className="mt-4 flex gap-2">
                <Button onClick={() => void submit()}>{editing ? "Save changes" : "Create record"}</Button>
                <Button variant="outline" onClick={() => setForm({})}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
                <TableHead>Status</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
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
                  <TableCell>
                    <Badge variant={row.deletedAt || row.isActive === false ? "secondary" : "success"}>
                      {row.deletedAt || row.isActive === false ? "Inactive" : "Active"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => startEdit(row)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {resource === "parties" ? (
                        <Button variant="ghost" size="icon" asChild aria-label="View ledger">
                          <Link href={`/credit/ledger/${row.id}`}>
                            <BookOpen className="h-4 w-4" />
                          </Link>
                        </Button>
                      ) : null}
                      {resource === "materials" ? (
                        <Button variant="ghost" size="icon" onClick={() => void showHistory(row.id)} aria-label="Rate history">
                          <History className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" onClick={() => void softDelete(row.id)} aria-label="Delete">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 2} className="h-24 text-center text-muted-foreground">
                    {loading ? "Loading..." : "No records found."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>
                Next
              </Button>
            </div>
          </div>

          {historyRows ? (
            <div className="rounded-md border bg-background p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold">Rate Change History</h2>
                <Button variant="outline" size="sm" onClick={() => setHistoryRows(null)}>
                  Close
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Changed On</TableHead>
                    <TableHead className="text-right">Old Rate</TableHead>
                    <TableHead className="text-right">New Rate</TableHead>
                    <TableHead>Changed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{new Date(row.changedAt).toLocaleDateString("en-IN")}</TableCell>
                      <TableCell className="number-cell">{formatCurrency(row.oldRate)}</TableCell>
                      <TableCell className="number-cell">{formatCurrency(row.newRate)}</TableCell>
                      <TableCell>{row.changedBy}</TableCell>
                    </TableRow>
                  ))}
                  {!historyRows.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                        No rate changes yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function renderField(field: FieldConfig, value: any, onChange: (value: any) => void) {
  if (field.type === "textarea") {
    return <Textarea value={value ?? ""} onChange={(event) => onChange(event.target.value)} disabled={field.readOnly} />;
  }
  if (field.type === "checkbox") {
    return (
      <input
        type="checkbox"
        className="h-5 w-5"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
        disabled={field.readOnly}
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        className="h-10 rounded-md border bg-background px-3 text-sm"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        disabled={field.readOnly}
      >
        <option value="">Select</option>
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Input
      className={field.type === "number" ? "text-right tabular-nums" : undefined}
      type={field.type === "number" ? "number" : "text"}
      step={field.type === "number" ? "0.001" : undefined}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      required={field.required}
      disabled={field.readOnly}
    />
  );
}

function readPath(row: Record<string, any>, path: string) {
  return path.split(".").reduce((value, key) => value?.[key], row);
}

export const commonFormatters = {
  currency: (key: string) => (row: Record<string, any>) => formatCurrency(readPath(row, key)),
};
