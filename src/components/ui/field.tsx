import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("grid gap-1.5 text-sm font-medium", className)}>
      <span>{label}</span>
      {children}
      {error ? <span className="text-xs font-normal text-destructive">{error}</span> : null}
    </label>
  );
}
