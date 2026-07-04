"use client";

import { useTheme } from "@/components/providers/ThemeProvider";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";

export function ThemeSettings() {
  const { theme, toggleTheme } = useTheme();

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
          {theme === "dark" ? <Moon className="w-6 h-6 text-accent" /> : <Sun className="w-6 h-6 text-accent" />}
        </div>
      </div>

      <div className="flex items-center justify-between p-4 border rounded-md bg-background/50">
        <div>
          <p className="font-medium">Current Theme: {theme === "dark" ? "Dark Mode" : "Light Mode"}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {theme === "dark" 
              ? "Dark mode reduces eye strain in low-light conditions." 
              : "Light mode improves readability in bright environments."}
          </p>
        </div>
        <Button onClick={toggleTheme} variant="outline" className="gap-2">
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          Switch to {theme === "dark" ? "Light" : "Dark"}
        </Button>
      </div>
    </div>
  );
}
