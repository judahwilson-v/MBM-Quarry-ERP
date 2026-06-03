"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatQty } from "@/lib/utils";

export function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    async function load() {
      const body = await fetch("/api/v1/dashboard").then((response) => response.json());
      setData(body);
    }
    void load();
  }, []);

  const stats = data?.stats ?? {};
  const materialCodes: string[] = (data?.stockSummary ?? []).map((row: any) => row.material.code);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Today&apos;s sales, dispatch, outstanding, and stock position.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Today's Total Sales" value={formatCurrency(stats.todayTotalSales)} />
        <Stat label="Today's Cash" value={formatCurrency(stats.todayCash)} />
        <Stat label="Today's Bank + GPay" value={formatCurrency(stats.todayBank)} />
        <Stat label="Today's Credit" value={formatCurrency(stats.todayCredit)} />
        <Stat label="Total Outstanding" value={formatCurrency(stats.totalOutstanding)} />
        <Stat label="Trucks Today" value={String(stats.totalTrucksToday ?? 0)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-8">
        {materialCodes.map((code) => (
          <Card key={code}>
            <CardContent className="pt-5">
              <div className="text-sm text-muted-foreground">{code}</div>
              <div className="mt-1 text-xl font-semibold">{formatQty(data?.materialToday?.[code] ?? 0)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily Sales Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data?.dailySalesTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="cash" stackId="a" fill="#16a34a" />
                  <Bar dataKey="bank" stackId="a" fill="#2563eb" />
                  <Bar dataKey="gpay" stackId="a" fill="#0891b2" />
                  <Bar dataKey="credit" stackId="a" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <ChartPlaceholder />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Material Dispatch Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data?.materialDispatchTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {materialCodes.map((code, index) => (
                    <Line key={code} type="monotone" dataKey={code} stroke={colors[index]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <ChartPlaceholder />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.recentSales ?? []).map((row: any) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.time ?? new Date(row.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell>{row.vehicle?.vehicleNumber}</TableCell>
                    <TableCell>{row.party?.name}</TableCell>
                    <TableCell>{row.material?.name}</TableCell>
                    <TableCell className="number-cell">{formatQty(row.qty, "")}</TableCell>
                    <TableCell className="number-cell">{formatCurrency(row.netAmount)}</TableCell>
                    <TableCell>{row.paymentType}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="text-right">Reorder Level</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.stockSummary ?? []).map((row: any) => (
                  <TableRow key={row.material.id}>
                    <TableCell>{row.material.name}</TableCell>
                    <TableCell className="number-cell">{formatQty(row.material.currentStock)}</TableCell>
                    <TableCell className="number-cell">{formatQty(row.material.reorderLevel)}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "OK" ? "success" : row.status === "Low" ? "warning" : "destructive"}>
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function ChartPlaceholder() {
  return <div className="h-full w-full rounded-md border border-dashed bg-muted/40" />;
}

const colors = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#4f46e5", "#64748b"];
