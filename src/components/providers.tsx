"use client";

import { AppShell } from "@/components/app-shell";
import { PromptProvider } from "@/components/ui/prompt-provider";
import { UpdaterOverlay } from "@/components/ui/updater-overlay";
import { ThemeProvider } from "@/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <PromptProvider>
        <AppShell>{children}</AppShell>
        <UpdaterOverlay />
      </PromptProvider>
    </ThemeProvider>
  );
}
