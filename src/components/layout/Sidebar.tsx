"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard,
  BookOpen,
  ShoppingBag,
  Receipt,
  CarFront,
  Truck,
  Fuel,
  Users,
  Banknote,
  Briefcase,
  FileText,
  CreditCard,
  Download,
  Info,
  Settings,
  ChevronLeft,
  ChevronRight,
  Pickaxe
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  currentPath: string;
  syncStatus: "synced" | "pending" | "error";
}

type NavItem = {
  label: string;
  path: string;
  icon: React.ElementType;
  shortcut: string;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navigation: NavGroup[] = [
  {
    title: "OPERATIONS",
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, shortcut: "D" },
      { label: "Day Book", path: "/day-book", icon: BookOpen, shortcut: "B" },
      { label: "Sales", path: "/sales", icon: ShoppingBag, shortcut: "S" },
      { label: "Expenses", path: "/expenses", icon: Receipt, shortcut: "E" },
      { label: "Vehicle Expenses", path: "/vehicle-expenses", icon: CarFront, shortcut: "V" },
    ],
  },
  {
    title: "INVENTORY",
    items: [
      { label: "Incoming Boulder", path: "/incoming-boulder", icon: Truck, shortcut: "I" },
      { label: "Fuel Management", path: "/fuel", icon: Fuel, shortcut: "F" },
      { label: "Vehicles", path: "/vehicles", icon: CarFront, shortcut: "C" },
    ],
  },
  {
    title: "MASTERS",
    items: [
      { label: "Parties", path: "/parties", icon: Users, shortcut: "P" },
      { label: "Material Rates", path: "/material-rates", icon: Banknote, shortcut: "M" },
      { label: "Employees", path: "/employees", icon: Briefcase, shortcut: "W" },
    ],
  },
  {
    title: "ACCOUNTS",
    items: [
      { label: "Party Ledger", path: "/party-ledger", icon: FileText, shortcut: "L" },
      { label: "Other Credit", path: "/other-credit", icon: CreditCard, shortcut: "O" },
      { label: "Tally Export", path: "/tally-export", icon: Download, shortcut: "T" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { label: "About & Backup", path: "/about", icon: Info, shortcut: "A" },
      { label: "Settings", path: "/settings", icon: Settings, shortcut: "X" },
    ],
  },
];

export default function Sidebar({ currentPath, syncStatus }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("mbm-sidebar");
    if (saved) {
      setIsCollapsed(saved === "collapsed");
    }
  }, []);

  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("mbm-sidebar", newState ? "collapsed" : "expanded");
  };

  if (!mounted) return null;

  return (
    <aside
      className={cn(
        "flex flex-col h-screen bg-[var(--bg-base)] border-r border-[var(--border)] transition-[width] duration-200 ease-in-out shrink-0",
        isCollapsed ? "w-[64px]" : "w-[240px]"
      )}
    >
      <div className="flex items-center p-4 border-b border-[var(--border-subtle)] overflow-hidden shrink-0 h-[72px]">
        <Pickaxe className="w-8 h-8 text-[var(--accent)] shrink-0" />
        <div
          className={cn(
            "ml-3 flex flex-col transition-opacity duration-200 whitespace-nowrap",
            isCollapsed ? "opacity-0 w-0" : "opacity-100"
          )}
        >
          <span className="font-bold text-[var(--text-primary)]">MBM Quarry</span>
          <span className="text-xs text-[var(--text-muted)]">Management System</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-thin">
        {navigation.map((group, groupIdx) => (
          <div key={groupIdx} className="mb-6">
            {!isCollapsed && (
              <div className="px-4 mb-2 text-xs font-semibold tracking-wider text-[var(--text-muted)]">
                {group.title}
              </div>
            )}
            <nav className="space-y-1">
              {group.items.map((item, itemIdx) => {
                const isActive = currentPath === item.path;
                return (
                  <Link
                    key={itemIdx}
                    href={item.path}
                    title={isCollapsed ? item.label : undefined}
                    className={cn(
                      "group flex items-center px-4 py-2 text-sm font-medium transition-colors relative",
                      isActive
                        ? "bg-[var(--accent-subtle)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[var(--accent)]" />
                    )}

                    <item.icon
                      className={cn(
                        "w-5 h-5 shrink-0",
                        isActive
                          ? "text-[var(--accent)]"
                          : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]",
                        isCollapsed ? "mx-auto" : "mr-3"
                      )}
                    />

                    {!isCollapsed && (
                      <span className="flex-1 truncate">{item.label}</span>
                    )}

                    {!isCollapsed && (
                      <span className="hidden group-hover:flex items-center justify-center bg-[var(--bg-card)] text-[var(--text-muted)] text-[10px] font-bold rounded px-1.5 py-0.5 border border-[var(--border-subtle)]">
                        {item.shortcut}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-base)]">
        <div className="flex items-center overflow-hidden">
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full shrink-0",
              syncStatus === "synced" && "bg-[var(--success)]",
              syncStatus === "pending" && "bg-[var(--warning)]",
              syncStatus === "error" && "bg-[var(--danger)]"
            )}
          />
          {!isCollapsed && (
            <span className="ml-2 text-xs text-[var(--text-muted)] capitalize whitespace-nowrap">
              {syncStatus}
            </span>
          )}
        </div>

        <button
          onClick={toggleCollapse}
          className="p-1.5 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition-colors focus:outline-none"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
