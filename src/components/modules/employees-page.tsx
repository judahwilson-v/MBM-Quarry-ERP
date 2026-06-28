"use client";

import { useEffect, useState } from "react";
import { Search, Check, User, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listEmployees, saveEmployee, deleteEmployee } from "@/lib/offline-actions";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";

type EmployeeRow = any;

function blankForm() {
  return {
    id: "",
    name: "",
    phone: "",
    address: "",
    role: "STAFF"
  };
}

export function EmployeesPage() {
  const [data, setData] = useState<EmployeeRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blankForm());
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      setData(await listEmployees());
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  function edit(row: EmployeeRow) {
    setForm({
      id: row.id,
      name: row.name,
      phone: row.phone || "",
      address: row.address || "",
      role: row.role || "STAFF",
    });
    setIsEditing(true);
    setMessage("");
    setError("");
  }

  async function submit() {
    setError("");
    setMessage("");
    try {
      if (!form.name.trim()) throw new Error("Name is required");
      
      await saveEmployee(form);
      setMessage("Employee saved successfully!");
      setForm(blankForm());
      setIsEditing(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Are you sure? This will delete the employee. Their ledger records will also be deleted.")) return;
    try {
      await deleteEmployee(id);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const filtered = data.filter(row => {
    const q = search.toLowerCase();
    if (row.name.toLowerCase().includes(q)) return true;
    if (row.phone?.toLowerCase().includes(q)) return true;
    if (row.role?.toLowerCase().includes(q)) return true;
    return false;
  });

  return (
    <div className="space-y-6 p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">Manage employee profiles and roles.</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 h-fit">
          <CardHeader>
            <CardTitle>{isEditing ? "Edit Employee" : "New Employee"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="rounded-md bg-red-500/15 p-3 text-sm text-red-500">{error}</div>}
            {message && <div className="rounded-md bg-emerald-500/15 p-3 text-sm text-emerald-500">{message}</div>}

            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Phone Number</label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Role / Title</label>
              <Input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} placeholder="e.g. Driver, Staff, Operator" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Address</label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={submit} className="flex-1">
                <Check className="mr-2 h-4 w-4" /> {isEditing ? "Update" : "Save"}
              </Button>
              {isEditing && (
                <Button variant="outline" onClick={() => { setIsEditing(false); setForm(blankForm()); }}>
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle>Directory</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name or role..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left font-medium text-muted-foreground">
                      <th className="p-4">Name</th>
                      <th className="p-4">Role</th>
                      <th className="p-4">Phone</th>
                      <th className="p-4 text-right">Balance</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="p-4 text-center">Loading...</td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">No records found.</td></tr>
                    ) : (
                      filtered.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/50">
                          <td className="p-4 font-medium flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {row.name}
                          </td>
                          <td className="p-4 text-muted-foreground">{row.role}</td>
                          <td className="p-4 text-muted-foreground">{row.phone || "-"}</td>
                          <td className="p-4 text-right tabular-nums font-medium">
                            {row.balance > 0 ? (
                              <span className="text-emerald-600">+{formatCurrency(row.balance)}</span>
                            ) : row.balance < 0 ? (
                              <span className="text-rose-600">{formatCurrency(row.balance)}</span>
                            ) : (
                              <span className="text-muted-foreground">{formatCurrency(0)}</span>
                            )}
                          </td>
                          <td className="p-4 text-right flex justify-end gap-1">
                            <Link href={`/employees/${row.id}`} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 px-3 py-2 text-blue-600">
                              Ledger <ChevronRight className="ml-1 h-4 w-4" />
                            </Link>
                            <Button variant="ghost" size="sm" onClick={() => edit(row)}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => remove(row.id)} className="text-red-500 hover:text-red-600">Del</Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
