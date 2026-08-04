"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, Check, Printer, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getEmployeeLedger, saveEmployeeLedgerEntry, listEmployees } from "@/app/actions/employees";
import { formatCurrency } from "@/lib/utils";
import { exportToExcel } from "@/lib/export";
import Link from "next/link";

function todayInputValue() {
  const offset = new Date().getTimezoneOffset() * 60000;
  return new Date(Date.now() - offset).toISOString().slice(0, 10);
}

export function EmployeeLedgerPage({ id }: { id: string }) {
  const [data, setData] = useState<any[]>([]);
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const [form, setForm] = useState({
    date: todayInputValue(),
    type: "SALARY",
    amount: "",
    description: "",
    cashPaid: "",
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [entries, all] = await Promise.all([getEmployeeLedger(id), listEmployees()]);
      setData(entries);
      setEmployee(all.find((e: any) => e.id === id));
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submit() {
    setError("");
    setMessage("");
    try {
      if (!form.amount) throw new Error("Amount is required");
      
      await saveEmployeeLedgerEntry({
        employeeId: id,
        ...form
      });
      setMessage("Ledger entry saved successfully!");
      setForm({ ...form, amount: "", description: "", cashPaid: "" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function printReceipt(row: any) {
    
    const html = `
      <html>
        <head>
          <title>Salary/Advance Slip</title>
          <style>
            body { font-family: monospace; padding: 20px; font-size: 14px; max-width: 300px; }
            h2 { text-align: center; margin-bottom: 5px; font-size: 18px; }
            .subtitle { text-align: center; margin-bottom: 20px; font-size: 12px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 15px 0; }
            .footer { text-align: center; font-size: 12px; margin-top: 30px; }
          </style>
        </head>
        <body>
          <h2>MBM QUARRY</h2>
          <div class="subtitle">Employee Slip</div>
          
          <div class="row">
            <span>Date:</span>
            <span>${format(new Date(row.date), "dd/MM/yyyy")}</span>
          </div>
          <div class="row">
            <span>Employee:</span>
            <span>${employee?.name || ""}</span>
          </div>
          <div class="row">
            <span>Type:</span>
            <span>${row.type}</span>
          </div>
          <div class="divider"></div>
          
          <div class="row bold">
            <span>Amount:</span>
            <span>₹${row.amount}</span>
          </div>
          
          ${row.description ? `
          <div style="margin-top: 10px; font-size: 12px">
            Note: ${row.description}
          </div>
          ` : ''}
          
          <div class="divider"></div>
          <div class="row">
            <span>New Balance:</span>
            <span class="${row.balance > 0 ? 'bold' : ''}">₹${row.balance}</span>
          </div>
          
          <div class="footer">Signature</div>
          <script>window.print(); setTimeout(() => window.close(), 500);</script>
        </body>
      </html>
    `;

    // Try silent print first if electron and enabled
    const { isElectron, printSilently } = await import("@/lib/electron");
    const isSilentEnabled = typeof window !== 'undefined' && localStorage.getItem('silentPrinting') === 'true';
    if (isElectron() && isSilentEnabled) {
      const res = await printSilently(undefined, html);
      if (res.success) return; // successful silent print
    }

    // Fallback to browser print
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function handleExportExcel() {
    if (!employee || data.length === 0) return;
    
    const excelData = data.map(row => ({
      Date: format(new Date(row.date), "dd/MM/yyyy"),
      Type: row.type,
      Description: row.description || "-",
      "Credit (+)": row.type === 'SALARY' ? row.amount : 0,
      "Debit (-)": row.type !== 'SALARY' ? row.amount : 0,
      Balance: row.balance
    }));
    
    excelData.push({
      Date: "CLOSING BALANCE",
      Type: "",
      Description: "",
      "Credit (+)": employee.balance > 0 ? employee.balance : 0,
      "Debit (-)": employee.balance < 0 ? Math.abs(employee.balance) : 0,
      Balance: employee.balance
    });

    exportToExcel(excelData, `Employee_Ledger_${employee.name.replace(/\s+/g, '_')}`);
  }

  return (
    <div className="space-y-6 p-4 lg:p-8 max-w-7xl mx-auto print:p-0 print:space-y-0 print:max-w-none">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/employees" className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-transparent hover:bg-muted text-sm font-medium transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{employee?.name || "Employee"} Ledger</h1>
            <p className="text-muted-foreground">Manage salary, advances, and payments.</p>
          </div>
        </div>
        {employee && (
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Current Balance</div>
              <div className={`text-2xl font-bold ${employee.balance > 0 ? 'text-emerald-600' : employee.balance < 0 ? 'text-rose-600' : ''}`}>
                {employee.balance > 0 ? "+" : ""}{formatCurrency(employee.balance)}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportExcel} className="print:hidden">
                <Download className="mr-2 h-4 w-4" />
                Export Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
                <Printer className="mr-2 h-4 w-4" />
                Print Statement
              </Button>
            </div>
          </div>
        )}
      </div>

      {employee && (
        <div className="hidden print:block mb-8 text-center border-b pb-4">
          <h1 className="text-3xl font-bold tracking-tight">MBM QUARRY</h1>
          <p className="text-muted-foreground text-sm uppercase tracking-wider mt-1">Employee Account Statement</p>
          <div className="mt-6 flex justify-between items-end text-left">
            <div>
              <p className="text-sm text-muted-foreground">Employee Name</p>
              <h2 className="text-2xl font-bold">{employee.name}</h2>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Generated On</p>
              <p className="font-medium">{new Date().toLocaleString('en-IN')}</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 h-fit print:hidden">
          <CardHeader>
            <CardTitle>New Ledger Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <div className="rounded-md bg-red-500/15 p-3 text-sm text-red-500">{error}</div>}
            {message && <div className="rounded-md bg-emerald-500/15 p-3 text-sm text-emerald-500">{message}</div>}

            <div className="space-y-2">
              <label className="text-sm font-medium">Date</label>
              <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Entry Type</label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="SALARY">Salary Earned (+)</option>
                <option value="ADVANCE">Advance Given (-)</option>
                <option value="PAYMENT">Payment Made (-)</option>
                <option value="DEDUCTION">Deduction (-)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>

            {(form.type === 'ADVANCE' || form.type === 'PAYMENT') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Cash Paid (₹)</label>
                <Input type="number" value={form.cashPaid} onChange={e => setForm({ ...form, cashPaid: e.target.value })} />
                <p className="text-xs text-muted-foreground">This amount will be deducted from DayBook Cash Balance.</p>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Description / Notes</label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. June Salary" />
            </div>

            <div className="flex gap-2 pt-4">
              <Button onClick={submit} className="flex-1">
                <Check className="mr-2 h-4 w-4" /> Save Entry
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 print:col-span-3 w-full print:border-none print:shadow-none">
          <CardHeader className="print:hidden">
            <CardTitle>Ledger Statement</CardTitle>
          </CardHeader>
          <CardContent className="print:p-0">
            <div className="rounded-md border print:border-none">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 print:bg-transparent print:border-b-2 print:border-black text-left font-medium text-muted-foreground print:text-black">
                      <th className="p-4">Date</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Details</th>
                      <th className="p-4 text-right">Credit (+)</th>
                      <th className="p-4 text-right">Debit (-)</th>
                      <th className="p-4 text-right">Balance</th>
                      <th className="p-4 text-center print:hidden">Print</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="p-4 text-center">Loading...</td></tr>
                    ) : data.length === 0 ? (
                      <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No records found.</td></tr>
                    ) : (
                      data.map((row) => (
                        <tr key={row.id} className="border-b hover:bg-muted/50">
                          <td className="p-4">{format(new Date(row.date), "dd/MM/yyyy")}</td>
                          <td className="p-4">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${row.type === 'SALARY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {row.type}
                            </span>
                          </td>
                          <td className="p-4 text-muted-foreground">{row.description || "-"}</td>
                          <td className="p-4 text-right tabular-nums text-emerald-600">
                            {row.type === 'SALARY' ? `+${formatCurrency(row.amount)}` : "-"}
                          </td>
                          <td className="p-4 text-right tabular-nums text-rose-600">
                            {row.type !== 'SALARY' ? `-${formatCurrency(row.amount)}` : "-"}
                          </td>
                          <td className="p-4 text-right font-medium tabular-nums border-l print:border-none bg-muted/20 print:bg-transparent">
                            {formatCurrency(row.balance)}
                          </td>
                          <td className="p-4 text-center print:hidden">
                            <Button variant="ghost" size="sm" onClick={() => printReceipt(row)} title="Print Slip">
                              <Printer className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {employee && data.length > 0 && (
                <div className="hidden print:flex justify-end mt-8 border-t-2 border-black pt-4">
                  <div className="w-64">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Closing Balance:</span>
                      <span>
                        {employee.balance > 0 ? "+" : ""}{formatCurrency(employee.balance)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
