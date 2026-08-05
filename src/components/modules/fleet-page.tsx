"use client";

import { useState } from "react";
import { Plus, Wrench, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FleetPage() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fleet Maintenance</h1>
          <p className="text-muted-foreground mt-1">Manage vehicle maintenance, engine hours, and schedules.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setActiveTab("schedules")}>
            <Settings className="w-4 h-4 mr-2" />
            Schedules
          </Button>
          <Button onClick={() => setActiveTab("log")}>
            <Plus className="w-4 h-4 mr-2" />
            Log Maintenance
          </Button>
        </div>
      </div>

      <div className="flex border-b">
        <button
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("overview")}
        >
          Vehicle Overview
        </button>
        <button
          className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "history"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setActiveTab("history")}
        >
          Maintenance History
        </button>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-6 flex flex-col items-center justify-center text-center min-h-[300px]">
        <Wrench className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
        <h3 className="text-lg font-semibold mb-2">Fleet Management Active</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          This module is ready to track engine hours, PM schedules, and fuel consumption for your assets.
        </p>
      </div>
    </div>
  );
}
