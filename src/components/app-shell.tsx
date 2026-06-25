"use client";

import { useState } from "react";
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
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/sales", label: "Sales", icon: ReceiptText },
  { href: "/purchases/boulder", label: "Incoming Boulder", icon: Pickaxe },
  { href: "/masters/vehicles", label: "Vehicles", icon: Truck },
  { href: "/masters/parties", label: "Parties", icon: UserCircle },
  { href: "/masters/materials", label: "Material Rates", icon: Boxes },
  { href: "/credit/list", label: "Party Credit", icon: Banknote },
  { href: "/credit/employee", label: "Employee Credit", icon: CircleDollarSign },
];

const mobileItems = navItems.slice(0, 5);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 border-r bg-card shadow-xl">
            <ShellBrand onClose={() => setSidebarOpen(false)} />
            <ShellNav pathname={pathname} onNavigate={() => setSidebarOpen(false)} />
          </aside>
        </div>
      ) : null}

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-card lg:block">
        <ShellBrand />
        <ShellNav pathname={pathname} />
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

function ShellBrand({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-16 items-center justify-between border-b px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Pickaxe className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-semibold">MBM Quarry</div>
          <div className="text-xs text-muted-foreground">Phase 1.1 Offline</div>
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
    <nav className="grid gap-1 overflow-y-auto p-3">
      {navItems.map((item) => (
        <NavLink key={item.href} item={item} active={isActivePath(pathname, item.href)} onClick={onNavigate} />
      ))}
    </nav>
  );
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: (typeof navItems)[number];
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
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

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
