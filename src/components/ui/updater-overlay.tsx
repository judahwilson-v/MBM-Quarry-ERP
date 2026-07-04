"use client";

import React, { useEffect, useState } from "react";
import { Download, RefreshCcw, X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type UpdaterStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

export function UpdaterOverlay() {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [version, setVersion] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const electron = (window as any).electron;
    if (!electron) return;

    const cleanup = electron.onUpdaterEvent((data: any) => {
      switch (data.type) {
        case "checking":
          setStatus("checking");
          setVisible(true);
          break;
        case "available":
          setStatus("available");
          setVersion(data.info?.version || "");
          setVisible(true);
          break;
        case "not-available":
          if (status === "checking") {
            setStatus("idle");
            setVisible(false);
          }
          break;
        case "progress":
          setStatus("downloading");
          setProgress(data.progress?.percent || 0);
          break;
        case "downloaded":
          setStatus("ready");
          setVersion(data.info?.version || "");
          setProgress(100);
          break;
        case "error":
          setStatus("error");
          setErrorMsg(data.error || "Unknown error");
          setVisible(true);
          break;
      }
    });

    return cleanup;
  }, [status]);

  const handleDownload = async () => {
    const electron = (window as any).electron;
    if (electron && electron.downloadUpdate) {
      setStatus("downloading");
      setProgress(0);
      await electron.downloadUpdate();
    }
  };

  const handleInstall = async () => {
    const electron = (window as any).electron;
    if (electron && electron.installUpdate) {
      // Show loading state while backup happens
      setStatus("checking"); 
      await electron.installUpdate(version);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    // If we dismiss an error or available, reset to idle so it can trigger again later if manually checked
    if (status === "error" || status === "available") {
      setStatus("idle");
    }
  };

  if (!visible || status === "idle") return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] w-80 bg-[var(--bg-surface)] border border-[var(--border-light)] rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300">
      
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-light)] bg-[var(--bg-card)]">
        <div className="flex items-center gap-2">
          {status === "checking" && <RefreshCcw className="w-4 h-4 animate-spin text-blue-500" />}
          {status === "available" && <Download className="w-4 h-4 text-blue-500" />}
          {status === "downloading" && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
          {status === "ready" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
          {status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
          <h3 className="font-semibold text-sm text-[var(--text-primary)]">
            {status === "checking" && "Checking for Updates..."}
            {status === "available" && "Update Available"}
            {status === "downloading" && "Downloading Update..."}
            {status === "ready" && "Update Ready"}
            {status === "error" && "Update Error"}
          </h3>
        </div>
        {(status === "error" || status === "available") && (
          <button onClick={handleDismiss} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {status === "checking" && (
          <p className="text-sm text-[var(--text-secondary)]">Please wait while we check for the latest version...</p>
        )}

        {status === "available" && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              Version <strong>{version}</strong> is available to download.
            </p>
            <div className="flex gap-2">
              <button 
                onClick={handleDownload}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                Download Now
              </button>
            </div>
          </div>
        )}

        {status === "downloading" && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-[var(--text-secondary)]">
              <span>Downloading</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-[var(--border-light)] rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {status === "ready" && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-secondary)]">
              The update is ready. Please save your work before installing.
            </p>
            <button 
              onClick={handleInstall}
              className="w-full bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              Restart & Install
            </button>
          </div>
        )}

        {status === "error" && (
          <p className="text-sm text-red-500 whitespace-pre-wrap">{errorMsg}</p>
        )}
      </div>

    </div>
  );
}
