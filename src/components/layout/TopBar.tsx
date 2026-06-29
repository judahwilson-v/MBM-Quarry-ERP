"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Receipt, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title: string;
  breadcrumb?: { label: string; href: string }[];
  syncStatus: "synced" | "pending" | "error";
  lastSyncTime?: Date;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(date: Date) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  
  const dayName = days[date.getDay()];
  const dayNum = date.getDate();
  const monthName = months[date.getMonth()];
  const year = date.getFullYear();
  
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
}

function formatTimeAgo(date: Date, now: Date) {
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins <= 0) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

export default function TopBar({
  title,
  breadcrumb,
  syncStatus,
  lastSyncTime,
}: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    setMounted(true);
    setCurrentTime(new Date());
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="relative h-[72px] bg-[var(--bg-base)] border-b border-[var(--border-subtle)] flex items-center justify-between px-6 shrink-0 transition-colors duration-200">
      <div className="flex flex-col justify-center z-10">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center text-xs text-[var(--text-muted)] mb-0.5">
            {breadcrumb.map((bc, idx) => (
              <React.Fragment key={idx}>
                <Link href={bc.href} className="hover:text-[var(--text-primary)] transition-colors">
                  {bc.label}
                </Link>
                {idx < breadcrumb.length - 1 && <span className="mx-2 text-[var(--border-subtle)]">/</span>}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
          {title}
        </h1>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center justify-center z-0">
        <div className="text-[15px] font-semibold text-[var(--text-primary)] tracking-tight leading-tight">
          {mounted && currentTime ? formatTime(currentTime) : "--:--"}
        </div>
        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
          {mounted && currentTime ? formatDate(currentTime) : "---"}
        </div>
      </div>

      <div className="flex items-center gap-4 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/sales/new"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] text-white rounded-md text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Sale
          </Link>
          <Link
            href="/expenses/new"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--border)] text-[var(--accent)] rounded-md text-sm font-medium hover:bg-[var(--bg-card)] transition-colors"
          >
            <Receipt className="w-4 h-4" />
            Expense
          </Link>
        </div>

        <div className="w-px h-8 bg-[var(--border-subtle)]" />

        <button
          onClick={toggleTheme}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors focus:outline-none"
          title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          {mounted ? (
            theme === "dark" ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />
          ) : (
            <div className="w-5 h-5" />
          )}
        </button>

        <div className="w-px h-8 bg-[var(--border-subtle)]" />

        <div
          className="flex flex-col items-end cursor-help group"
          title={lastSyncTime ? lastSyncTime.toLocaleString() : "No sync data"}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--text-primary)]">
              {syncStatus === "synced" && "Synced"}
              {syncStatus === "pending" && "Syncing..."}
              {syncStatus === "error" && "Error"}
            </span>
            <div
              className={cn(
                "w-2.5 h-2.5 rounded-full animate-pulse-dot",
                syncStatus === "synced" && "bg-[var(--success)] shadow-[0_0_8px_var(--success-subtle)]",
                syncStatus === "pending" && "bg-[var(--warning)] shadow-[0_0_8px_var(--warning-subtle)]",
                syncStatus === "error" && "bg-[var(--danger)] shadow-[0_0_8px_var(--danger-subtle)]"
              )}
            />
          </div>
          <span className="text-[10px] text-[var(--text-muted)] mt-0.5 whitespace-nowrap">
            {mounted && currentTime
              ? lastSyncTime
                ? formatTimeAgo(lastSyncTime, currentTime)
                : "Never"
              : "--"}
          </span>
        </div>
      </div>
    </header>
  );
}
