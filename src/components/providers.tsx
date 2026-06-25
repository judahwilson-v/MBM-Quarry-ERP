"use client";

import { AppShell } from "@/components/app-shell";

export function Providers({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
