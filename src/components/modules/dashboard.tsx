"use client";

import { ArrowRight, Banknote, Factory, IndianRupee, PieChart, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import Link from "next/link";
import { type getDashboardMetrics } from "@/lib/domain/dashboard/service";

type Metrics = Awaited<ReturnType<typeof getDashboardMetrics>>;

export function Dashboard({ metrics }: { metrics: Metrics }) {
  if (!metrics) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 lg:p-8">
      <div>
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

      <div className="grid gap-4 md:grid-cols-2">
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
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5" />
              Cash in Hand
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-emerald-600">
              {formatCurrency(metrics.cashBalance)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">As per the latest day book closing balance.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Bank Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-blue-600">
              {formatCurrency(metrics.bankBalance)}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">As per the latest day book closing balance.</p>
          </CardContent>
        </Card>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{formatCurrency(amount)}</div>
        <p className="text-xs text-muted-foreground">{trend}</p>
      </CardContent>
    </Card>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent hover:text-accent-foreground transition-colors">
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" />
        <span className="font-medium">{label}</span>
      </div>
      <ArrowRight className="h-5 w-5 opacity-50 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
