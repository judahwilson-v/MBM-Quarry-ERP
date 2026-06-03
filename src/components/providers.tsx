"use client";

import { SessionProvider } from "next-auth/react";
import { OfflineProvider } from "@/components/offline-provider";
import { AppShell } from "@/components/app-shell";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <OfflineProvider>
        <AppShell>{children}</AppShell>
      </OfflineProvider>
    </SessionProvider>
  );
}
