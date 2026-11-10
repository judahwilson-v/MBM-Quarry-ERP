import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function InlineEditableCell({
  value,
  displayValue,
  rowId,
  colKey,
  activeCell,
  setActiveCell,
  onSave,
  onNavigate,
  retentionRef,
  type = "text",
  className,
}: {
  value: string | number | undefined | null;
  displayValue?: React.ReactNode;
  rowId: string;
  colKey: string;
  activeCell: { rowId: string; colKey: string } | null;
  setActiveCell: (cell: { rowId: string; colKey: string } | null) => void;
  onSave: (val: string) => Promise<boolean>;
  onNavigate?: (dir: "up" | "down" | "left" | "right" | "next" | "prev") => void;
  retentionRef?: React.MutableRefObject<boolean>;
  type?: string;
  className?: string;
}) {
  const isActive = activeCell?.rowId === rowId && activeCell?.colKey === colKey;
  const [temp, setTemp] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (isActive) {
      setTemp(String(value ?? ""));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isActive, value]);

  if (!isActive) {
    return (
      <div 
        onClick={() => setActiveCell({ rowId, colKey })} 
        className={cn("min-h-6 min-w-8 cursor-text border border-transparent hover:border-blue-300 rounded px-1 -mx-1 flex items-center transition-colors", className)}
      >
        {displayValue !== undefined ? displayValue : (value || <span className="opacity-0">_</span>)}
      </div>
    );
  }

  // A commit is the only way out of an edited cell. A refused save keeps the
  // editor open with the typed text intact; only success (or no change) may
  // navigate or close. While one save is in flight - its PIN prompt can steal
  // focus and fire onBlur - a second commit is refused instead of double-saving
  // or closing the cell underneath it.
  const commit = async (): Promise<boolean> => {
    if (savingRef.current) return false;
    if (temp === String(value ?? "")) {
      // A reverted draft has nothing to lose; release retention.
      if (retentionRef) retentionRef.current = false;
      return true;
    }
    savingRef.current = true;
    // Retain from attempt start: a cross-cell click landing while this save is
    // in flight is already gated, so the draft cannot be switched away.
    if (retentionRef) retentionRef.current = true;
    try {
      const ok = await onSave(temp);
      if (ok && retentionRef) retentionRef.current = false;
      return ok;
    } finally {
      savingRef.current = false;
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (await commit()) {
        if (onNavigate) onNavigate("down");
        else setActiveCell(null);
      }
    } else if (e.key === "Escape") {
      // Escape remains a deliberate discard: no save, no confirmation.
      if (retentionRef) retentionRef.current = false;
      setActiveCell(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if ((await commit()) && onNavigate) onNavigate("up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if ((await commit()) && onNavigate) onNavigate("down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      if ((await commit()) && onNavigate) onNavigate(e.shiftKey ? "prev" : "next");
    }
  };

  return (
    <Input 
      ref={inputRef} 
      type={type}
      value={temp} 
      onChange={e => setTemp(e.target.value)} 
      onKeyDown={handleKeyDown} 
      onBlur={async () => {
        if (await commit()) setActiveCell(null);
      }} 
      className="h-7 text-xs px-1 py-0 border-blue-500 rounded-sm w-full min-w-[80px]" 
    />
  );
}
