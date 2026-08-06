"use client";

import React, { useEffect, useState } from "react";
import { Download, RefreshCcw, X, CheckCircle2, AlertCircle, ArrowDownToLine, Zap, Minus, Maximize2 } from "lucide-react";

type UpdaterStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

interface DownloadStats {
  speed: string;
  transferred: string;
  total: string;
}

export function UpdaterOverlay() {
  const [status, setStatus] = useState<UpdaterStatus>("idle");
  const [version, setVersion] = useState<string>("");
  const [releaseNotes, setReleaseNotes] = useState<string>("");
  const [progress, setProgress] = useState<number>(0);
  const [stats, setStats] = useState<DownloadStats | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [visible, setVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Format bytes to human readable
  const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  useEffect(() => {
    const electron = window.electron;
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
          
          // Parse release notes robustly
          let notes = "";
          if (typeof data.info?.releaseNotes === "string") {
            notes = data.info.releaseNotes;
          } else if (Array.isArray(data.info?.releaseNotes)) {
            notes = data.info.releaseNotes.map((n: any) => n.note || "").join("\n");
          }
          setReleaseNotes(notes || "Enhancements, performance improvements, and bug fixes.");
          
          setVisible(true);
          setIsMinimized(false);
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
          if (data.progress) {
            setStats({
              speed: formatBytes(data.progress.bytesPerSecond) + "/s",
              transferred: formatBytes(data.progress.transferred),
              total: formatBytes(data.progress.total)
            });
          }
          break;
        case "downloaded":
          setStatus("ready");
          setVersion(data.info?.version || "");
          setProgress(100);
          break;
        case "error":
          setStatus("error");
          setErrorMsg(data.error || "Unknown error occurred while updating.");
          setVisible(true);
          setIsMinimized(false);
          break;
      }
    });

    return cleanup;
  }, [status]);

  const handleDownload = async () => {
    const electron = window.electron;
    if (electron && electron.downloadUpdate) {
      setStatus("downloading");
      setProgress(0);
      await electron.downloadUpdate();
    }
  };

  const handleInstall = async () => {
    const electron = window.electron;
    if (electron && electron.installUpdate) {
      // Show checking to prevent multiple clicks
      setStatus("checking"); 
      await electron.installUpdate(version);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    setIsMinimized(false);
    if (status === "error" || status === "available") {
      setStatus("idle");
    }
  };

  if (!visible || status === "idle") return null;

  if (isMinimized && (status === "downloading" || status === "ready")) {
    return (
      <div className="fixed top-4 right-4 z-[9999] w-72 bg-[var(--bg-surface)] border border-[var(--border-light)] rounded-xl shadow-lg p-3 animate-in slide-in-from-top-2 duration-300">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {status === "downloading" ? (
              <ArrowDownToLine className="w-4 h-4 text-blue-600 dark:text-blue-400 animate-bounce" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
            )}
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              {status === "downloading" ? "Downloading Update..." : "Update Ready"}
            </span>
          </div>
          <button 
            onClick={() => setIsMinimized(false)}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] p-1 rounded-md hover:bg-[var(--bg-muted)] transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        
        {status === "downloading" ? (
          <div className="space-y-1">
            <div className="w-full bg-[var(--bg-muted)] rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-blue-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-[var(--text-secondary)]">
              <span>{Math.round(progress)}%</span>
              <span>{stats?.speed || ""}</span>
            </div>
          </div>
        ) : (
          <button 
            onClick={handleInstall}
            className="w-full mt-2 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 rounded-lg transition-colors"
          >
            Restart to Install
          </button>
        )}
      </div>
    );
  }

  // We use a centered modal for a "professional software update" feel
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      
      <div className="w-full max-w-md bg-[var(--bg-surface)] border border-[var(--border-light)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        
        {/* Header Icon Area */}
        <div className="relative pt-8 pb-4 px-6 flex flex-col items-center border-b border-[var(--border-light)] bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-950/20">
          
          {(status === "error" || status === "available") && (
            <button 
              onClick={handleDismiss} 
              className="absolute top-4 right-4 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] p-1.5 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}

          {(status === "downloading" || status === "ready") && (
            <button 
              onClick={() => setIsMinimized(true)} 
              className="absolute top-4 right-4 text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] p-1.5 rounded-full transition-colors"
              title="Minimize to background"
            >
              <Minus className="w-5 h-5" />
            </button>
          )}

          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center mb-4 ring-8 ring-blue-50 dark:ring-blue-950/20">
            {status === "checking" && <RefreshCcw className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />}
            {status === "available" && <Zap className="w-8 h-8 text-blue-600 dark:text-blue-400 fill-blue-600/20" />}
            {status === "downloading" && <ArrowDownToLine className="w-8 h-8 animate-bounce text-blue-600 dark:text-blue-400" />}
            {status === "ready" && <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />}
            {status === "error" && <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />}
          </div>

          <h2 className="text-xl font-bold text-[var(--text-primary)] text-center">
            {status === "checking" && "Checking for Updates"}
            {status === "available" && "Software Update Available"}
            {status === "downloading" && "Downloading Update"}
            {status === "ready" && "Update Ready to Install"}
            {status === "error" && "Update Error"}
          </h2>
          
          {version && (status === "available" || status === "ready") && (
            <span className="mt-2 px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 rounded-full text-xs font-semibold">
              Version {version}
            </span>
          )}
        </div>

        {/* Body Area */}
        <div className="p-6">
          {status === "checking" && (
            <p className="text-center text-[var(--text-secondary)]">
              Connecting to the server to check for the latest features and security patches...
            </p>
          )}

          {status === "available" && (
            <div className="space-y-6">
              <div className="bg-[var(--bg-muted)] rounded-lg p-4 max-h-[160px] overflow-y-auto custom-scrollbar border border-[var(--border-light)] text-sm text-[var(--text-secondary)] whitespace-pre-wrap">
                <p className="font-semibold text-[var(--text-primary)] mb-2 text-xs uppercase tracking-wider">Release Notes</p>
                <div dangerouslySetInnerHTML={{ __html: releaseNotes }} />
              </div>
              
              <button 
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
              >
                <Download className="w-5 h-5" />
                Download and Install
              </button>
            </div>
          )}

          {status === "downloading" && (
            <div className="space-y-6 pt-2">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-medium text-[var(--text-primary)]">
                  <span>Downloading package...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                
                {/* Progress Bar Container */}
                <div className="w-full bg-[var(--bg-muted)] rounded-full h-3 overflow-hidden shadow-inner">
                  <div 
                    className="bg-blue-600 h-full rounded-full transition-all duration-300 relative overflow-hidden"
                    style={{ width: `${progress}%` }}
                  >
                    {/* Shimmer effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-[shimmer_1.5s_infinite]" />
                  </div>
                </div>
              </div>
              
              {/* Detailed Stats */}
              {stats && (
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-[var(--bg-muted)] rounded-lg p-3 border border-[var(--border-light)] flex flex-col">
                    <span className="text-[var(--text-secondary)] mb-1">Downloaded</span>
                    <span className="font-semibold text-[var(--text-primary)]">
                      {stats.transferred} <span className="text-muted-foreground font-normal">of {stats.total}</span>
                    </span>
                  </div>
                  <div className="bg-[var(--bg-muted)] rounded-lg p-3 border border-[var(--border-light)] flex flex-col">
                    <span className="text-[var(--text-secondary)] mb-1">Network Speed</span>
                    <span className="font-semibold text-[var(--text-primary)]">{stats.speed}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {status === "ready" && (
            <div className="space-y-6 text-center">
              <p className="text-[var(--text-secondary)] px-2">
                The software update has been fully downloaded and is ready to be applied. Your app will restart to complete the installation.
              </p>
              
              <button 
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
              >
                <RefreshCcw className="w-5 h-5" />
                Restart to Update
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-6 text-center">
              <div className="bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 p-4 rounded-lg border border-red-100 dark:border-red-900/30 text-sm">
                {errorMsg}
              </div>
              <button 
                onClick={handleDismiss}
                className="w-full bg-[var(--bg-muted)] hover:bg-[var(--border-light)] text-[var(--text-primary)] font-medium py-3 px-4 rounded-xl transition-colors active:scale-[0.98]"
              >
                Close and Try Again Later
              </button>
            </div>
          )}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% { transform: translateX(200%); }
        }
      `}} />
    </div>
  );
}
