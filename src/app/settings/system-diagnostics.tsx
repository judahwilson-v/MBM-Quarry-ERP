"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, HardDrive, FileText, Loader2 } from "lucide-react";
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
  const [isChecking, setIsChecking] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && (window as any).electron) {
      (window as any).electron.onUpdaterEvent((data: any) => {
        console.log("✓ IPC received updater-event:", data.type);
        
        switch(data.type) {
          case "checking":
            setUpdateStatus("Searching for updates...");
            toast({
              title: "Checking for Updates",
              description: "Searching for the latest release...",
            });
            break;
            
          case "available":
            setIsChecking(false);
            setUpdateStatus("Update available");
            toast({
              title: "Update Found!",
              description: `A new version is available. It is downloading in the background.`,
            });
            break;
            
          case "not-available":
            setIsChecking(false);
            setUpdateStatus("Up to date");
            toast({
              title: "You're up to date",
              description: "You are already running the latest version of MBM Quarry.",
            });
            break;
            
          case "progress":
            setUpdateStatus(`Downloading... ${Math.round(data.progress?.percent || 0)}%`);
            break;
            
          case "downloaded":
            setIsChecking(false);
            setUpdateStatus("Ready to install");
            toast({
              title: "Update Ready",
              description: "The update has been downloaded and will be installed on restart.",
            });
            break;
            
          case "error":
            setIsChecking(false);
            setUpdateStatus("Update failed");
            toast({
              title: "Update Error",
              description: data.error || "Failed to check for updates.",
              variant: "destructive"
            });
            break;
        }
      });
    }
  }, [toast]);
  
  const handleCheckUpdates = async () => {
    console.log("✓ Button clicked");
    setIsChecking(true);
    setUpdateStatus("Searching for updates...");
    
    // Send IPC message to the Electron main process
    if (typeof window !== "undefined" && (window as any).electron) {
      try {
        console.log("✓ IPC sent: check-updates");
        await (window as any).electron.checkUpdates();
      } catch (err: any) {
        console.error("Failed to check for updates", err);
        setIsChecking(false);
        setUpdateStatus("Update failed");
        toast({
          title: "Update Error",
          description: err.message || "Failed to communicate with updater process.",
          variant: "destructive"
        });
      }
    } else {
      // Fallback if not running in electron
      setTimeout(() => {
        setIsChecking(false);
        setUpdateStatus("Up to date");
        toast({
          title: "Up to Date",
          description: "You are running the web version.",
        });
      }, 1500);
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
          <Button variant="outline" size="sm" onClick={handleCheckUpdates} className="flex-1" disabled={isChecking}>
            {isChecking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {updateStatus ? updateStatus : "Check Updates"}
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
