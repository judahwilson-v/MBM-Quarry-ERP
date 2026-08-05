"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

export function ThemeSettings() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="bg-card border rounded-lg p-6 space-y-6 animate-pulse h-40"></div>;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <div className="bg-card border rounded-lg p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-medium">Appearance</h3>
          <p className="text-sm text-muted-foreground">
            Customize the visual theme of the application.
          </p>
        </div>
        <div className="p-3 bg-accent/10 rounded-full">
          {isDark ? <Moon className="w-6 h-6 text-accent" /> : <Sun className="w-6 h-6 text-accent" />}
        </div>
      </div>

      <div className="flex items-center justify-between p-4 border rounded-md bg-background/50">
        <div>
          <p className="font-medium">Current Theme: {isDark ? "Dark Mode" : "Light Mode"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {isDark 
              ? "Dark mode reduces eye strain in low-light conditions." 
              : "Light mode improves readability in bright environments."}
          </p>
        </div>
        <Button onClick={() => setTheme(isDark ? 'light' : 'dark')} variant="outline" className="gap-2">
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          Switch to {isDark ? "Light" : "Dark"}
        </Button>
      </div>
    </div>
  );
}
