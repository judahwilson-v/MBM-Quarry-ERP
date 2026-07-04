"use client";

import { ArrowRight, Banknote, Factory, IndianRupee, PieChart, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, cn } from "@/lib/utils";
import Link from "next/link";
import { type getDashboardMetrics } from "@/lib/domain/dashboard/service";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

type Metrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

export function Dashboard({ metrics }: { metrics: Metrics }) {
  if (!metrics) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 lg:p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of quarry operations and financials.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="Today's Sales"
          amount={metrics.today.sales}
          icon={TrendingUp}
          trend={`${formatCurrency(metrics.month.sales)} this month`}
          color="text-emerald-500"
        />
        <MetricCard
          title="Today's Purchases"
          amount={metrics.today.purchases}
          icon={TrendingDown}
          trend={`${formatCurrency(metrics.month.purchases)} this month`}
          color="text-amber-500"
        />
        <MetricCard
          title="Today's Expenses"
          amount={metrics.today.expenses}
          icon={Receipt}
          trend={`${formatCurrency(metrics.month.expenses)} this month`}
          color="text-rose-500"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>7-Day Performance</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartData} margin={{ top: 10, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} className="fill-muted-foreground" />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `${value / 1000}k`} className="fill-muted-foreground" />
                  <Tooltip 
                    cursor={{ fill: 'var(--accent)' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--background)', color: 'var(--foreground)' }}
                    formatter={(value: number) => [formatCurrency(value), undefined]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="sales" name="Sales" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-3 space-y-4">
          <MetricCard
            title="Total to Receive"
            amount={metrics.totalToReceive}
            icon={TrendingUp}
            trend="Total pending from customers"
            color="text-emerald-500"
          />
          <MetricCard
            title="Total to Pay"
            amount={metrics.totalToPay}
            icon={TrendingDown}
            trend="Total owed to suppliers/boulders"
            color="text-rose-500"
          />
          <div className="grid grid-cols-2 gap-4">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                <Banknote className="h-6 w-6 text-emerald-600 mb-2" />
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Cash Balance</div>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                  {formatCurrency(metrics.cashBalance)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-4 flex flex-col justify-center items-center text-center">
                <IndianRupee className="h-6 w-6 text-blue-600 mb-2" />
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Bank Balance</div>
                <div className="text-xl font-bold text-blue-700 dark:text-blue-400">
                  {formatCurrency(metrics.bankBalance)}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <QuickLink href="/sales" icon={Factory} label="Go to Sales" />
        <QuickLink href="/purchases/boulder" icon={TrendingDown} label="Go to Purchases" />
        <QuickLink href="/reports" icon={PieChart} label="View Day Book" />
      </div>
    </div>
  );
}

function MetricCard({
  title,
  amount,
  icon: Icon,
  trend,
  color,
}: {
  title: string;
  amount: number;
  icon: any;
  trend: string;
  color: string;
}) {
  return (
    <Card className="overflow-hidden transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 bg-muted/20">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={cn("p-2 rounded-full bg-background border", color.replace('text-', 'bg-').replace('500', '50'))}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="text-2xl font-bold tracking-tight">{formatCurrency(amount)}</div>
        <p className="text-xs text-muted-foreground mt-1">{trend}</p>
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between rounded-xl border bg-card p-4 hover:border-primary/50 hover:bg-primary/5 transition-all shadow-sm hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform">
          <Icon className="h-5 w-5" />
        </div>
        <span className="font-semibold">{label}</span>
      </div>
      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
    </Link>
  );
}
