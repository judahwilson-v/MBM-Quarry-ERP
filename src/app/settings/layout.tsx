"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Server, RefreshCw, FileText, FileJson, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const settingsNav = [
  { href: "/settings/general", label: "System Diagnostics & Reliability", icon: Server },
  { href: "/settings/about", label: "About & Backup", icon: Info },
  { href: "/settings/sync", label: "Sync Dashboard", icon: RefreshCw },
  { href: "/settings/user-logs", label: "User Logs", icon: FileText },
  { href: "/settings/tally", label: "Tally Export", icon: FileJson },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row gap-8 p-4 pt-6 md:p-8 max-w-7xl mx-auto min-h-[calc(100vh-4rem)]">
      <aside className="w-full md:w-64 shrink-0 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-1">Settings</h2>
          <p className="text-sm text-muted-foreground">Manage business details, diagnostics, and integrations</p>
        </div>
        <nav className="flex flex-col gap-1">
          {settingsNav.map((item) => {
            const isActive = pathname === item.href || (item.href === "/settings/general" && pathname === "/settings");
            const Icon = item.icon;
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary font-semibold" 
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
