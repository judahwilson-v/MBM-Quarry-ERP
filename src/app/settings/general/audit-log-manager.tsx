"use client";

import { Button } from "@/components/ui/button";

export function AuditLogManager() {
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow mt-6">
      <div className="p-6 pb-4 border-b">
        <h3 className="tracking-tight text-lg font-semibold">Audit Log Management</h3>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Age-based local audit cleanup is paused. Audit history can include changes still waiting for delivery. No records are deleted; cleanup needs a reviewed delivery and recovery policy.
        </p>
        <Button variant="outline" disabled>Cleanup Paused</Button>
      </div>
    </div>
  );
}
