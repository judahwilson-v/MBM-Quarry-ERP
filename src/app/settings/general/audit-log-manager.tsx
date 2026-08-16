"use client";

import { useState } from "react";
import { purgeOldAuditLogs } from "@/lib/daybook-actions";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { usePrompt } from "@/components/ui/prompt-provider";

export function AuditLogManager() {
  const [purging, setPurging] = useState(false);
  const { confirmAction } = usePrompt();

  const handlePurge = async () => {
    const confirmed = await confirmAction("Are you sure you want to permanently delete audit logs older than 30 days? This action cannot be undone.");
    if (!confirmed) return;

    setPurging(true);
    try {
      await purgeOldAuditLogs();
      alert("Old audit logs purged successfully.");
    } catch {
      alert("Failed to purge logs.");
    } finally {
      setPurging(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow mt-6">
      <div className="p-6 pb-4 border-b">
        <h3 className="tracking-tight text-lg font-semibold text-red-600">Audit Log Management</h3>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Purge old audit logs to free up space. This will delete all DayBook and General audit logs older than 30 days.
        </p>
        <Button 
          variant="destructive" 
          onClick={handlePurge}
          disabled={purging}
        >
          <Trash2 className="w-4 h-4 mr-2" />
          {purging ? "Purging..." : "Purge Logs Older Than 1 Month"}
        </Button>
      </div>
    </div>
  );
}
