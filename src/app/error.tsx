"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Next.js Client Error:", error);
  }, [error]);

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-6 text-center">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-xl bg-card p-8 shadow-xl border border-destructive/20">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong!</h2>
        <div className="rounded-md bg-muted p-4 w-full text-left overflow-auto max-h-48 text-sm text-destructive font-mono">
          {error.message || "Unknown Application Error"}
        </div>
        <button
          onClick={() => reset()}
          className="mt-4 rounded-md bg-destructive px-6 py-2.5 text-sm font-semibold text-destructive-foreground shadow-sm hover:bg-destructive/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
