"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Activity,
  Banknote,
  BookOpen,
  Boxes,
  ClipboardList,
  Database,
  FileBarChart,
  History,
  Home,
  LogOut,
  Menu,
  RefreshCcw,
  Scale,
  Truck,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useOffline } from "@/components/offline-provider";
import { checkPermission, type PermissionModule } from "@/lib/permissions";

const navItems: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: PermissionModule;
}> = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/sales", label: "Sales", icon: Truck, module: "sales.add" },
  { href: "/purchases/boulder", label: "Our Purchase", icon: ClipboardList, module: "accounts" },
  { href: "/purchases", label: "Purchases", icon: ClipboardList, module: "accounts" },
  { href: "/masters/parties", label: "Masters", icon: Database, module: "masters" },
  { href: "/credit/list", label: "Credit", icon: BookOpen, module: "ledger" },
  { href: "/pending-book", label: "Pending", icon: ClipboardList, module: "accounts" },
  { href: "/accounts", label: "Accounts", icon: Banknote, module: "accounts" },
  { href: "/inventory", label: "Inventory", icon: Boxes, module: "inventory" },
  { href: "/reconciliation", label: "Reconciliation", icon: Scale, module: "reports" },
  { href: "/reports", label: "Reports", icon: FileBarChart, module: "reports" },
  { href: "/audit", label: "Audit", icon: History, module: "audit" },
];

const mobileItems = navItems.slice(0, 5);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { isOnline, pendingCount, syncMessage, isSyncing, syncNow } = useOffline();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  const role = session?.user?.role;
  const items = navItems.filter((item) => !item.module || checkPermission(role, item.module));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {!isOnline ? (
        <div className="sticky top-0 z-50 bg-warning px-4 py-2 text-center text-sm font-medium text-warning-foreground">
          You are offline - entries require connection to the production database
        </div>
      ) : null}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-card lg:block">
        <div className="flex h-16 items-center gap-3 border-b px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold">MBM Quarry</div>
            <div className="text-xs text-muted-foreground">ERP & Dispatch</div>
          </div>
        </div>
        <nav className="grid gap-1 p-3">
          {items.map((item) => (
            <NavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
          ))}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold sm:text-base">MBM Quarry ERP</div>
              <div className="truncate text-xs text-muted-foreground">
                {status === "loading" ? "Loading session" : session?.user?.name ?? "Signed out"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isOnline ? "success" : "warning"} className="hidden sm:inline-flex">
              {isOnline ? <Wifi className="mr-1 h-3 w-3" /> : <WifiOff className="mr-1 h-3 w-3" />}
              {isOnline ? "Online" : "Offline"}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void syncNow()} disabled={isSyncing}>
              <RefreshCcw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">{pendingCount ? `${pendingCount} pending` : "Cloud DB"}</span>
            </Button>
            <Button variant="ghost" size="icon" aria-label="Logout" onClick={() => void signOut({ callbackUrl: "/login" })}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {syncMessage ? (
          <div className="border-b bg-muted px-4 py-2 text-sm text-muted-foreground lg:px-6">{syncMessage}</div>
        ) : null}

        <main className="pb-20 lg:pb-0">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card lg:hidden">
        {mobileItems
          .filter((item) => !item.module || checkPermission(role, item.module))
          .map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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

function NavLink({
  item,
  active,
}: {
  item: (typeof navItems)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </Link>
  );
}
