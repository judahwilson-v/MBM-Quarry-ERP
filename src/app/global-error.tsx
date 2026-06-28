"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Next.js Global Error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex h-screen w-full flex-col items-center justify-center bg-red-50 p-6 text-center">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-xl bg-white p-8 shadow-xl border border-red-100">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">Critical Application Error</h2>
            <div className="rounded-md bg-gray-100 p-4 w-full text-left overflow-auto max-h-48 text-sm text-red-800 font-mono">
              {error.message || "Unknown Root Error"}
            </div>
            <button
              onClick={() => reset()}
              className="mt-4 rounded-md bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
