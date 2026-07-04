import React from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import MetricCard from "@/components/dashboard/MetricCard";
import {
  TrendingUp,
  ShoppingCart,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Landmark,
  ArrowRight
} from "lucide-react";

export default function DashboardPage() {
  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="flex h-screen bg-[var(--bg-base)] overflow-hidden">
      <Sidebar currentPath="/dashboard" syncStatus="synced" />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar 
          title="Dashboard" 
          syncStatus="synced"
          lastSyncTime={new Date()}
        />

        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          <div className="max-w-7xl mx-auto space-y-6">
            
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h2>
              <p className="text-[var(--text-secondary)] mt-1">
                Overview of quarry operations and financials.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <MetricCard
                title="Today's Sales"
                value="₹0.00"
                subtext="₹14,644.19 this month"
                variant="success"
                trend="up"
                trendValue="+8.2%"
                icon={TrendingUp}
              />
              <MetricCard
                title="Today's Purchases"
                value="₹0.00"
                subtext="₹0.00 this month"
                variant="info"
                trend="neutral"
                icon={ShoppingCart}
              />
              <MetricCard
                title="Today's Expenses"
                value="₹0.00"
                subtext="₹0.00 this month"
                variant="warning"
                trend="neutral"
                icon={Receipt}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Link href="/party-ledger" className="block focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-xl transition-shadow">
                <MetricCard
                  title="Total to Receive"
                  value="₹9,144.19"
                  subtext="Total pending from customers"
                  variant="success"
                  size="lg"
                  icon={ArrowDownCircle}
                />
              </Link>
              <Link href="/party-ledger" className="block focus:outline-none focus:ring-2 focus:ring-[var(--accent)] rounded-xl transition-shadow">
                <MetricCard
                  title="Total to Pay"
                  value="₹0.00"
                  subtext="Total owed to suppliers"
                  variant="danger"
                  size="lg"
                  icon={ArrowUpCircle}
                />
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MetricCard
                title="Cash in Hand"
                value="₹0.00"
                subtext="As per latest day book closing balance"
                variant="default"
                icon={Wallet}
              />
              <MetricCard
                title="Bank Balance"
                value="₹0.00"
                subtext="As per latest day book closing balance"
                variant="info"
                icon={Landmark}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
              <Link
                href="/sales"
                className="h-12 rounded-lg font-medium flex items-center justify-between px-5 bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors group"
              >
                Go to Sales
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              
              <Link
                href="/purchases"
                className="h-12 rounded-lg font-medium flex items-center justify-between px-5 border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors group"
              >
                Go to Purchases
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>

              <Link
                href="/day-book"
                className="h-12 rounded-lg font-medium flex items-center justify-between px-5 border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors group"
              >
                View Day Book
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>

            <div className="pt-8 pb-4 text-center">
              <p className="text-xs text-[var(--text-muted)]">
                MBM Quarry Management • Offline SQLite System • Last updated: {currentDate}
              </p>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
