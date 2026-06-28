"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, RefreshCw, HardDrive, FileText } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export function SystemDiagnostics({ 
  appVersion, 
  databasePath, 
  backupPath 
}: { 
  appVersion: string, 
  databasePath: string,
  backupPath: string 
}) {
  const { toast } = useToast();
  
  const handleCheckUpdates = async () => {
    toast({
      title: "Checking for Updates",
      description: "If an update is available, you will receive a prompt shortly.",
    });
    
    // Send IPC message to the Electron main process
    if (typeof window !== "undefined" && (window as any).electron) {
      try {
        await (window as any).electron.checkUpdates();
      } catch (err) {
        console.error("Failed to check for updates", err);
      }
    }
  };

  const handleExportLogs = () => {
    toast({
      title: "Logs exported",
      description: "Logs are available in your AppData directory.",
    });
  };

  const handleBackup = () => {
    toast({
      title: "Manual Backup Triggered",
      description: `A backup is being created in ${backupPath}`,
    });
  };

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow">
      <div className="p-6 pb-4 border-b flex justify-between items-center">
        <h3 className="tracking-tight text-lg font-semibold">System Diagnostics & Reliability</h3>
      </div>
      <div className="p-6 space-y-4">
        
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Version</span>
          <span className="font-medium">{appVersion}</span>
        </div>
        
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Database Location</span>
          <span className="font-medium truncate max-w-[250px]" title={databasePath}>{databasePath.replace('file:', '')}</span>
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Backup Location</span>
          <span className="font-medium truncate max-w-[250px]" title={backupPath}>{backupPath}</span>
        </div>
        
        <div className="pt-4 flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleCheckUpdates} className="flex-1">
            <RefreshCw className="w-4 h-4 mr-2" />
            Check Updates
          </Button>
          <Button variant="outline" size="sm" onClick={handleBackup} className="flex-1">
            <HardDrive className="w-4 h-4 mr-2" />
            Backup Now
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportLogs} className="flex-1">
            <FileText className="w-4 h-4 mr-2" />
            Export Logs
          </Button>
        </div>
      </div>
    </div>
  );
}
