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
  type?: string;
  className?: string;
}) {
  const isActive = activeCell?.rowId === rowId && activeCell?.colKey === colKey;
  const [temp, setTemp] = useState(String(value ?? ""));
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (temp !== String(value ?? "")) {
        const ok = await onSave(temp);
        if (ok) {
          if (onNavigate) onNavigate("down");
          else setActiveCell(null);
        }
      } else {
        if (onNavigate) onNavigate("down");
        else setActiveCell(null);
      }
    } else if (e.key === "Escape") {
      setActiveCell(null);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (temp !== String(value ?? "")) await onSave(temp);
      if (onNavigate) onNavigate("up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (temp !== String(value ?? "")) await onSave(temp);
      if (onNavigate) onNavigate("down");
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (temp !== String(value ?? "")) await onSave(temp);
      if (onNavigate) onNavigate(e.shiftKey ? "prev" : "next");
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
        if (temp !== String(value ?? "")) {
          await onSave(temp);
        }
        setActiveCell(null);
      }} 
      className="h-7 text-xs px-1 py-0 border-blue-500 rounded-sm w-full min-w-[80px]" 
    />
  );
}
