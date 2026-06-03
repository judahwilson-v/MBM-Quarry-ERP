"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
};

export function SearchableSelect({
  value,
  customValue,
  options,
  placeholder,
  onChange,
  onCustomValueChange,
  onCreate,
  createLabel,
  allowCustom = false,
}: {
  value?: string;
  customValue?: string;
  options: SelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  onCustomValueChange?: (value: string) => void;
  onCreate?: (query: string) => void;
  createLabel?: string;
  allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(allowCustom ? -1 : 0);
  const selected = options.find((option) => option.value === value);
  const inputValue = allowCustom ? customValue ?? selected?.label ?? "" : open ? query : selected?.label ?? "";
  const searchText = allowCustom ? inputValue : query;
  const filtered = useMemo(() => {
    const q = searchText.toLowerCase();
    return options.filter(
      (option) => option.label.toLowerCase().includes(q) || option.description?.toLowerCase().includes(q),
    );
  }, [options, searchText]);

  function choose(option: SelectOption) {
    onChange(option.value);
    onCustomValueChange?.(option.label);
    setOpen(false);
    setQuery("");
    setActiveIndex(allowCustom ? -1 : 0);
  }

  return (
    <div className="relative">
      <input
        className="h-10 w-full rounded-md border bg-background px-3 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
        placeholder={placeholder}
        value={inputValue}
        onFocus={() => {
          setOpen(true);
          setActiveIndex(allowCustom ? -1 : 0);
          if (!allowCustom) setQuery("");
        }}
        onChange={(event) => {
          const next = event.target.value;
          setOpen(true);
          setActiveIndex(allowCustom ? -1 : 0);
          if (allowCustom) {
            onCustomValueChange?.(next);
            if (selected && next !== selected.label) onChange("");
          } else {
            setQuery(next);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          }
          if (event.key === "Enter") {
            if (open && activeIndex >= 0 && filtered[activeIndex]) {
              event.preventDefault();
              choose(filtered[activeIndex]);
              return;
            }
            if (allowCustom) {
              setOpen(false);
              return;
            }
          }
          if (event.key === "Escape") setOpen(false);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      <ChevronsUpDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 opacity-60" />
      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-2 shadow-lg">
          <div className="max-h-60 overflow-auto">
            {filtered.map((option, index) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                  index === activeIndex && "bg-accent",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <Check className={cn("h-4 w-4", option.value === value ? "opacity-100" : "opacity-0")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description ? (
                    <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
                  ) : null}
                </span>
              </button>
            ))}
            {!filtered.length ? (
              <div className="space-y-2 px-2 py-4 text-center text-sm text-muted-foreground">
                <div>{allowCustom && searchText.trim() ? "Press Enter to use this value" : "No match"}</div>
                {onCreate && searchText.trim() ? (
                  <button
                    type="button"
                    className="w-full rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-warning-foreground hover:bg-warning/20"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onCreate(searchText.trim());
                      setOpen(false);
                    }}
                  >
                    {createLabel ?? "Add this record"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
