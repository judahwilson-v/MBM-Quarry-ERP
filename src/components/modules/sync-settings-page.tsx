"use client";

import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useOffline } from "@/components/offline-provider";

export function SyncSettingsPage() {
  const { isOnline, syncMessage, syncNow } = useOffline();

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Production Database</h1>
          <p className="text-sm text-muted-foreground">Entries are saved directly to PostgreSQL through the server API.</p>
        </div>
        <Button onClick={() => void syncNow()}>
          <RefreshCcw className="h-4 w-4" />
          Check Connection
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cloud Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={isOnline ? "success" : "warning"}>{isOnline ? "Online" : "Offline"}</Badge>
          <p className="text-sm text-muted-foreground">
            {syncMessage || "No browser queue is used. Sales and boulder purchases require a live connection."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
