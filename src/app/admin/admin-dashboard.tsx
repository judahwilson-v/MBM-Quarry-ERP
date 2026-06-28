"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { forceSync, resetSyncQueue, getDatabaseInfo } from "@/app/actions/admin";
import { Database, RefreshCw, AlertTriangle, Download } from "lucide-react";

export function AdminDashboard({ expectedPin }: { expectedPin: string }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [dbInfo, setDbInfo] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === expectedPin) {
      setIsAuthenticated(true);
      fetchDbInfo();
    } else {
      toast({ title: "Access Denied", description: "Incorrect PIN", variant: "destructive" });
      setPin("");
    }
  };

  const fetchDbInfo = async () => {
    const res = await getDatabaseInfo();
    if (res.success) {
      setDbInfo(res.data);
    }
  };

  const handleForceSync = async () => {
    setIsLoading(true);
    const res = await forceSync();
    setIsLoading(false);
    toast({
      title: res.success ? "Sync Complete" : "Sync Failed",
      description: res.message,
      variant: res.success ? "default" : "destructive"
    });
  };

  const handleResetQueue = async () => {
    if (!confirm("Are you sure? This will force the app to re-download all data from Supabase. It may take a while.")) return;
    setIsLoading(true);
    const res = await resetSyncQueue();
    setIsLoading(false);
    toast({
      title: res.success ? "Queue Reset" : "Reset Failed",
      description: res.message,
      variant: res.success ? "default" : "destructive"
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="bg-card p-8 rounded-xl border shadow-lg max-w-sm w-full text-center space-y-6">
          <AlertTriangle className="w-12 h-12 mx-auto text-amber-500" />
          <h2 className="text-xl font-bold">Admin Access Required</h2>
          <p className="text-muted-foreground text-sm">Please enter the developer PIN to access diagnostic tools.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input 
              type="password" 
              placeholder="Enter PIN" 
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="text-center text-2xl tracking-widest"
              autoFocus
            />
            <Button type="submit" className="w-full">Unlock</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border bg-card shadow p-6">
          <h3 className="font-semibold text-lg flex items-center mb-4"><Database className="w-5 h-5 mr-2"/> Database Info</h3>
          {dbInfo ? (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span> <span className="font-medium text-emerald-500">{dbInfo.status}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Engine</span> <span className="font-medium">{dbInfo.version}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Sales</span> <span className="font-medium">{dbInfo.salesCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total Boulder</span> <span className="font-medium">{dbInfo.boulderCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Financial Events</span> <span className="font-medium">{dbInfo.eventCount}</span></div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground animate-pulse">Loading...</div>
          )}
        </div>

        <div className="rounded-xl border bg-card shadow p-6">
          <h3 className="font-semibold text-lg flex items-center mb-4"><RefreshCw className="w-5 h-5 mr-2"/> Sync Engine Tools</h3>
          <div className="space-y-4">
            <Button onClick={handleForceSync} disabled={isLoading} className="w-full justify-start" variant="outline">
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Force Immediate Sync
            </Button>
            <p className="text-xs text-muted-foreground">Bypasses the 5-minute timer and pushes local changes to Supabase immediately.</p>
            
            <Button onClick={handleResetQueue} disabled={isLoading} className="w-full justify-start" variant="destructive">
              <AlertTriangle className="w-4 h-4 mr-2" />
              Reset Sync Cursor
            </Button>
            <p className="text-xs text-muted-foreground">If the sync engine gets permanently stuck, this forces a complete re-download of all cloud data.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
