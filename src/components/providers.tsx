"use client";

import { AppShell } from "@/components/app-shell";
import { PromptProvider } from "@/components/ui/prompt-provider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <PromptProvider>
        <AppShell>{children}</AppShell>
      </PromptProvider>
    </ThemeProvider>
  );
}
