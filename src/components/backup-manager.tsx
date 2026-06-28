"use client";

import { useState, useEffect } from "react";
import { createLocalBackup, listLocalBackups, restoreLocalBackup } from "@/app/actions/database";
import { Button } from "@/components/ui/button";
import { Save, Upload, Download, RotateCcw, AlertTriangle } from "lucide-react";

export function BackupManager() {
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  useEffect(() => {
    loadBackups();
  }, []);

  async function loadBackups() {
    const list = await listLocalBackups();
    setBackups(list);
  }

  async function handleBackup() {
    setIsLoading(true);
    setMessage(null);
    const result = await createLocalBackup();
    setMessage({ text: result.message, type: result.success ? "success" : "error" });
    if (result.success) await loadBackups();
    setIsLoading(false);
  }

  async function handleRestore(filename: string) {
    if (!confirm(`Are you sure you want to restore ${filename}? Current database will be overwritten.`)) return;
    setIsLoading(true);
    setMessage(null);
    const result = await restoreLocalBackup(filename);
    setMessage({ text: result.message, type: result.success ? "success" : "error" });
    if (result.success) {
      alert("Database restored successfully. The application will now reload.");
      window.location.reload();
    }
    setIsLoading(false);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm("Are you sure you want to import this database? Current data will be completely overwritten.")) return;

    setIsLoading(true);
    setMessage(null);
    const formData = new FormData();
    formData.append("database", file);

    try {
      const res = await fetch("/api/database/import", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage({ text: data.message, type: "success" });
        alert("Database imported successfully. The application will now reload.");
        window.location.reload();
      } else {
        setMessage({ text: data.message || "Import failed", type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: err.message, type: "error" });
    } finally {
      setIsLoading(false);
      e.target.value = ""; // Reset input
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <Button onClick={handleBackup} disabled={isLoading} className="gap-2">
          <Save className="h-4 w-4" />
          Backup Database
        </Button>
        <div className="relative">
          <input 
            type="file" 
            accept=".db,.sqlite" 
            onChange={handleImport}
            disabled={isLoading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          <Button variant="outline" disabled={isLoading} className="gap-2 w-full">
            <Upload className="h-4 w-4" />
            Import Database
          </Button>
        </div>
        <Button variant="outline" asChild className="gap-2">
          <a href="/api/database/export" download="quarry-export.db">
            <Download className="h-4 w-4" />
            Export Database
          </a>
        </Button>
      </div>

      {message && (
        <div className={`p-4 rounded-md text-sm flex items-center gap-2 ${message.type === 'error' ? 'bg-red-50 text-red-900 border border-red-200' : 'bg-green-50 text-green-900 border border-green-200'}`}>
          {message.type === 'error' && <AlertTriangle className="h-4 w-4" />}
          {message.text}
        </div>
      )}

      {backups.length > 0 && (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3">Backup File</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Size</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {backups.map(b => (
                <tr key={b.name} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3">{new Date(b.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{(b.size / 1024 / 1024).toFixed(2)} MB</td>
                  <td className="px-4 py-3 text-right">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleRestore(b.name)}
                      disabled={isLoading}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
