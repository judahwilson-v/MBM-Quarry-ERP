"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { triggerSync, fetchSyncStatus, fetchOnlineStatus } from "@/app/actions/sync";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Banknote,
  Boxes,
  CircleDollarSign,
  Menu,
  Pickaxe,
  ReceiptText,
  Truck,
  UserCircle,
  X, Cloud, CloudOff, LayoutDashboard, Settings, BookOpen, Fuel, Wallet, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
  { href: "/fleet", label: "Fleet Maintenance", icon: Truck },
  { href: "/settings/general", label: "Settings", icon: Settings },
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
  const [, setFeatures] = useState<any>({ enableWeighbridge: false });
  const [dynamicNavItems, setDynamicNavItems] = useState([...navItems]);

  useEffect(() => {
    // Fetch global settings to determine feature flags
    import("@/app/actions/settings").then(({ getGlobalSettings }) => {
      getGlobalSettings().then((settings) => {
        setFeatures(settings);
        const filtered = navItems.filter((item) => {
          if (item.href === "/fleet" && !settings.enableFleetMaintenance) return false;
          return true;
        });
        
        if (settings.enableWeighbridge) {
          import("lucide-react").then(({ Scale }) => {
            const insertIndex = filtered.findIndex(i => i.href === "/daybook") + 1;
            filtered.splice(insertIndex, 0, { href: "/weighbridge", label: "Weighbridge", icon: Scale as any });
            setDynamicNavItems(filtered);
          });
        } else {
          setDynamicNavItems(filtered);
        }
      });
    });
  }, []);

  const router = useRouter();
  useEffect(() => {
    const handleGlobalKeys = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is actively typing in an input (except if they explicitly use Alt which is safe on Windows)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (!e.altKey) return;
      }
      
      // Alt+S -> /sales
      if (e.key.toLowerCase() === "s" && e.altKey) {
        e.preventDefault();
        router.push("/sales");
      }
      
      // Alt+B -> /purchases/boulder
      if (e.key.toLowerCase() === "b" && e.altKey) {
        e.preventDefault();
        router.push("/purchases/boulder");
      }

      // Alt+V -> /masters/vehicles
      if (e.key.toLowerCase() === "v" && e.altKey) {
        e.preventDefault();
        router.push("/masters/vehicles");
      }
    };
    
    document.addEventListener("keydown", handleGlobalKeys);
    return () => document.removeEventListener("keydown", handleGlobalKeys);
  }, [router]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 flex flex-col border-r bg-card shadow-xl">
            <ShellBrand onClose={() => setSidebarOpen(false)} />
            <ShellNav pathname={pathname} navItems={dynamicNavItems} onNavigate={() => setSidebarOpen(false)} />
            <ShellSync />
          </aside>
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex flex-col border-r bg-card lg:flex">
        <ShellBrand />
        <ShellNav pathname={pathname} navItems={dynamicNavItems} />
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
              <div className="truncate text-xs text-muted-foreground">Cloud-synced quarry management</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>

        <main className="pb-20 lg:pb-0">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 h-14 w-full border-t bg-card lg:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "w-full min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] sm:text-[11px] text-muted-foreground transition-colors",
                active ? "text-primary font-medium" : "hover:text-foreground/80",
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="truncate w-full text-center">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}



function ShellBrand({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between border-b px-5 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Pickaxe className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold">MBM Quarry</div>
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

function ShellNav({ pathname, navItems, onNavigate }: { pathname: string; navItems: any[]; onNavigate?: () => void }) {
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
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [, setConsecutiveErrors] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const runPoll = useCallback(async () => {
    let hasError = false;
    try {
      const [status, online] = await Promise.all([
        fetchSyncStatus(),
        fetchOnlineStatus(),
      ]);
      setSyncStatus(status);
      setIsOnline(online);
      if (status?.status === "ERROR" || !online) {
        hasError = true;
      }
    } catch (e) {
      console.error("[Sync Poll] Exception during status check:", e);
      hasError = true;
    }

    setConsecutiveErrors((prev) => {
      const nextErrors = hasError ? prev + 1 : 0;
      // Exponential backoff: 10s base, 20s, 40s, 80s, 160s, up to 300s (5m) max
      const nextDelay = hasError
        ? Math.min(10000 * Math.pow(2, prev), 300000)
        : 10000;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runPoll, nextDelay);
      return nextErrors;
    });
  }, []);

  useEffect(() => {
    runPoll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runPoll]);

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const syncRes = await triggerSync();
      const [newStatus, online] = await Promise.all([
        fetchSyncStatus(),
        fetchOnlineStatus(),
      ]);
      setSyncStatus(newStatus);
      setIsOnline(online);

      if (syncRes?.status === "ERROR" || newStatus?.status === "ERROR" || !online) {
        setConsecutiveErrors((prev) => prev + 1);
      } else {
        setConsecutiveErrors(0);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(runPoll, 10000);
      }
    } catch (e) {
      console.error("[Sync UI] Sync failed:", e);
      setConsecutiveErrors((prev) => prev + 1);
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    // Setup Supabase Realtime Listener for instant cross-PC syncing
    let channel: any;
    
    import("@/lib/supabase/client").then(({ supabase }) => {
      // In React Strict Mode, useEffect runs twice. To prevent "cannot add .on() after subscribe()" errors,
      // we generate a unique channel name for each execution.
      const uniqueChannelName = `schema-db-changes-${Math.random().toString(36).substring(7)}`;
      
      // We listen to the audit_logs table to detect any writes from other PCs
      channel = supabase.channel(uniqueChannelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'audit_logs' },
          (payload) => {
             console.log('[Realtime] Detected remote change, triggering pull sync...', payload);
             handleSync();
          }
        )
        // Also listen to direct projection tables in case they didn't produce audit logs
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'outgoing_sales' },
          () => handleSync()
        )
        .subscribe((status) => {
          console.log('[Realtime] Status:', status);
        });
    });

    return () => {
      if (channel) {
        import("@/lib/supabase/client").then(({ supabase }) => {
          supabase.removeChannel(channel);
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const isError = syncStatus?.status === "ERROR" || syncStatus?.status === "PARTIAL_SUCCESS";

  return (
    <div className="p-4 border-t flex-shrink-0 bg-card">
      <div className="mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold mb-1">
          {isOnline === null ? (
            <>
              <span className="text-gray-400">⚪</span>
              <span>Checking...</span>
            </>
          ) : isOnline && !isError ? (
            <>
              <span className="text-emerald-500">🟢</span>
              <span>Online</span>
            </>
          ) : (
            <>
              <span className="text-red-500">🔴</span>
              <span>{isError ? "Sync Error" : "Offline"}</span>
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
          disabled={isSyncing || syncStatus?.status === "SYNCING"}
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




