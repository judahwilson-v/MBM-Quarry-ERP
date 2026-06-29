"use client";

import { useState, useEffect } from "react";
import { triggerSync, fetchSyncStatus } from "@/app/actions/sync";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Boxes,
  CircleDollarSign,
  Menu,
  Pickaxe,
  ReceiptText,
  Truck,
  UserCircle,
  X, Cloud, CloudOff, LayoutDashboard, Info, Settings, BookOpen, Fuel, Wallet, FileJson, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AutoUpdater } from "./auto-updater";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/daybook", label: "Day Book", icon: BookOpen },
  { href: "/sales", label: "Sales", icon: ReceiptText },
  { href: "/expenses", label: "Expenses", icon: Wallet },
  { href: "/expenses/vehicles", label: "Vehicle Expenses", icon: Truck },
  { href: "/purchases/boulder", label: "Incoming Boulder", icon: Pickaxe },
  { href: "/fuel", label: "Fuel Management", icon: Fuel },
  { href: "/inventory", label: "Inventory Stock", icon: Package },
  { href: "/masters/vehicles", label: "Vehicles", icon: Truck },
  { href: "/masters/parties", label: "Parties", icon: UserCircle },
  { href: "/masters/materials", label: "Material Rates", icon: Boxes },
  { href: "/credit/list", label: "Party Ledger", icon: Banknote },
  { href: "/employees", label: "Employees", icon: UserCircle },
  { href: "/credit/other", label: "Other Credit", icon: CircleDollarSign },
  { href: "/tally", label: "Tally Export", icon: FileJson },
  { href: "/about", label: "About & Backup", icon: Info },
  { href: "/settings", label: "Settings", icon: Settings },
];

const mobileItems = navItems.slice(0, 5);

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

function NavLink({ item, active, onClick }: { item: typeof navItems[0], active: boolean, onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AutoUpdater />
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r bg-card shadow-xl">
            <ShellBrand onClose={() => setSidebarOpen(false)} />
            <ShellNav pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
            <ShellSync />
          </aside>
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex flex-col border-r bg-card lg:block">
        <ShellBrand />
        <ShellNav pathname={pathname} />
        <ShellSync />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold sm:text-base">MBM Quarry Management</div>
              <div className="truncate text-xs text-muted-foreground">Offline single-computer SQLite system</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="pb-20 lg:pb-0">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card lg:hidden">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground",
                active && "text-primary",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

import { SyncIndicator } from "./sync-indicator";

function ShellBrand({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between border-b px-5 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Pickaxe className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold">MBM Quarry</div>
          <div className="mt-0.5">
            <SyncIndicator />
          </div>
        </div>
      </div>
      {onClose ? (
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close menu">
          <X className="h-5 w-5" />
        </Button>
      ) : null}
    </div>
  );
}

function ShellNav({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="grid gap-1 overflow-y-auto p-3 flex-1">
      {navItems.map((item) => (
        <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} onClick={onNavigate} />
      ))}
    </nav>
  );
}

function ShellSync() {
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    fetchSyncStatus().then(setSyncStatus).catch(console.error);
    const interval = setInterval(() => {
      fetchSyncStatus().then(setSyncStatus).catch(console.error);
    }, 15000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await triggerSync();
      const newStatus = await fetchSyncStatus();
      setSyncStatus(newStatus);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncing(false);
    }
  };

  const getRelativeTime = (dateString?: string) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    if (date.getTime() === 0) return "Never";
    
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    
    if (Math.abs(seconds) < 60) return rtf.format(seconds, 'second');
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
    return rtf.format(Math.round(hours / 24), 'day');
  };

  const pending = syncStatus?.pendingCount || 0;
  const isError = syncStatus?.status === "ERROR";

  return (
    <div className="p-4 border-t flex-shrink-0 bg-card">
      <div className="mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold mb-1">
          {isOnline && !isError ? (
            <>
              <span className="text-emerald-500">🟢</span>
              <span>Online</span>
            </>
          ) : (
            <>
              <span className="text-red-500">🔴</span>
              <span>Offline</span>
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground ml-6">
          {pending > 0 ? (
            <span>{pending} changes pending</span>
          ) : (
            <span className="flex items-center gap-1">
              ✓ Synced {getRelativeTime(syncStatus?.lastSyncedAt)}
            </span>
          )}
        </div>
      </div>
      
      <div className="space-y-1">
        <button 
          onClick={handleSync}
          disabled={isSyncing || syncStatus?.status === "SYNCING" || !isOnline}
          className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-all border shadow-sm hover:bg-accent disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            {isError ? <CloudOff className="h-4 w-4 text-red-500" /> : <Cloud className="h-4 w-4" />}
            <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
          </div>
          {pending > 0 && !isSyncing && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
              {pending}
            </span>
          )}
        </button>
        {isError && (
            <p className="pt-2 text-xs text-red-500 truncate max-w-full" title={syncStatus.lastError}>{syncStatus.lastError}</p>
        )}
      </div>
    </div>
  );
}




