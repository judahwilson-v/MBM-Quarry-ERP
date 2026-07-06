import React from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import MetricCard from "@/components/dashboard/MetricCard";
import { getDashboardMetrics } from "@/lib/domain/dashboard/service";
import { getSyncStatus } from "@/lib/sync/sync-service";
import {
  TrendingUp,
  ShoppingCart,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Landmark,
  ArrowRight,
} from "lucide-react";

export const dynamic = "force-dynamic";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function toUiSyncStatus(status: Awaited<ReturnType<typeof getSyncStatus>>) {
  if (status.status === "ERROR") return "error" as const;
  if (status.status === "SYNCING" || status.pendingCount > 0) return "pending" as const;
  return "synced" as const;
}

export default async function DashboardPage() {
  const [metrics, syncStatus] = await Promise.all([getDashboardMetrics(), getSyncStatus()]);
  const uiSyncStatus = toUiSyncStatus(syncStatus);
  const currentDate = new Date().toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const balanceDate = metrics.balanceAsOf
    ? metrics.balanceAsOf.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "No day book yet";

  return (
    <div className="flex h-screen bg-[var(--bg-base)] overflow-hidden">
      <Sidebar currentPath="/dashboard" syncStatus={uiSyncStatus} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          title="Dashboard"
          syncStatus={uiSyncStatus}
          lastSyncTime={syncStatus.lastSyncedAt ?? undefined}
        />

        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="max-w-7xl mx-auto space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h2>
              <p className="text-[var(--text-secondary)] mt-1">Overview of quarry operations and financials.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <MetricCard
                title="Today's Sales"
                value={formatCurrency(metrics.today.sales)}
                subtext={`${formatCurrency(metrics.month.sales)} this month`}
                variant="success"
                icon={TrendingUp}
              />
              <MetricCard
                title="Today's Purchases"
                value={formatCurrency(metrics.today.purchases)}
                subtext={`${formatCurrency(metrics.month.purchases)} this month`}
                variant="info"
                icon={ShoppingCart}
              />
              <MetricCard
                title="Today's Expenses"
                value={formatCurrency(metrics.today.expenses)}
                subtext={`${formatCurrency(metrics.month.expenses)} this month`}
                variant="warning"
                icon={Receipt}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Link href="/credit/list" className="block focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-xl transition-shadow">
                <MetricCard
                  title="Total to Receive"
                  value={formatCurrency(metrics.totalToReceive)}
                  subtext="Latest balances owed by customers"
                  variant="success"
                  size="lg"
                  icon={ArrowDownCircle}
                />
              </Link>
              <Link href="/credit/list" className="block focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-xl transition-shadow">
                <MetricCard
                  title="Total to Pay"
                  value={formatCurrency(metrics.totalToPay)}
                  subtext="Latest balances owed to suppliers"
                  variant="danger"
                  size="lg"
                  icon={ArrowUpCircle}
                />
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MetricCard
                title="Cash in Hand"
                value={formatCurrency(metrics.cashBalance)}
                subtext={`Latest day book: ${balanceDate}`}
                variant="default"
                icon={Wallet}
              />
              <MetricCard
                title="Bank Balance"
                value={formatCurrency(metrics.bankBalance)}
                subtext={`Latest day book: ${balanceDate}`}
                variant="info"
                icon={Landmark}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              <Link href="/sales" className="h-12 rounded-lg font-medium flex items-center justify-between px-5 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors group">
                Go to Sales
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/purchases/boulder" className="h-12 rounded-lg font-medium flex items-center justify-between px-5 border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors group">
                Go to Purchases
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link href="/daybook" className="h-12 rounded-lg font-medium flex items-center justify-between px-5 border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors group">
                View Day Book
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="pt-8 pb-4 text-center">
              <p className="text-xs text-muted-foreground">
                MBM Quarry Management • Cloud Synced • Last updated: {currentDate}
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
