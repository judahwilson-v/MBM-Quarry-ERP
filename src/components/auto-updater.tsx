"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DownloadCloud, RefreshCw, X } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

type UpdaterState = "idle" | "checking" | "available" | "downloading" | "downloaded" | "error";

export function AutoUpdater() {
  const [state, setState] = useState<UpdaterState>("idle");
  const [progress, setProgress] = useState(0);
  const [version, setVersion] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).electron) return;

    (window as any).electron.onUpdaterEvent((data: any) => {
      switch (data.type) {
        case "checking":
          setState("checking");
          break;
        case "available":
          setState("available");
          setVersion(data.info?.version || "");
          toast({
            title: "Update Available",
            description: `Version ${data.info?.version || ""} is downloading in the background.`,
          });
          break;
        case "not-available":
          setState("idle");
          break;
        case "progress":
          setState("downloading");
          setProgress(Math.round(data.progress?.percent || 0));
          break;
        case "downloaded":
          setState("downloaded");
          setVersion(data.info?.version || "");
          toast({
            title: "Update Ready",
            description: "A new version has been downloaded and is ready to install.",
            duration: 10000,
          });
          break;
        case "error":
          setState("error");
          setErrorMsg(data.error || "Unknown error");
          break;
      }
    });
  }, [toast]);

  const handleInstall = () => {
    if (typeof window !== "undefined" && (window as any).electron) {
      (window as any).electron.installUpdate();
    }
  };

  const handleDismiss = () => {
    setState("idle");
  };

  if (state === "idle" || state === "checking" || state === "error") {
    // We don't show persistent UI for these, only toasts or nothing.
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-card border shadow-lg rounded-xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-5">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2 font-medium text-sm">
          <DownloadCloud className="w-4 h-4 text-blue-500" />
          Update {version ? `v${version}` : ""}
        </div>
        <button onClick={handleDismiss} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {state === "available" && (
          <p className="text-sm text-muted-foreground">
            A new version is available. Preparing download...
          </p>
        )}

        {state === "downloading" && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span>Downloading update...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div 
                className="bg-blue-500 h-full transition-all duration-300 ease-out" 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        )}

        {state === "downloaded" && (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              Update downloaded successfully. Restart the application to apply the changes.
            </p>
            <Button onClick={handleInstall} className="w-full" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Install and Restart
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
