"use client";

import { AppShell } from "@/components/app-shell";
import { PromptProvider } from "@/components/ui/prompt-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PromptProvider>
      <AppShell>{children}</AppShell>
    </PromptProvider>
  );
}
