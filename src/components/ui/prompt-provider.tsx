"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PromptContextType = {
  promptPassword: (message: string) => Promise<string | null>;
  confirmAction: (message: string) => Promise<boolean>;
};

const PromptContext = createContext<PromptContextType | null>(null);

export function usePrompt() {
  const context = useContext(PromptContext);
  if (!context) throw new Error("usePrompt must be used within PromptProvider");
  return context;
}

export function PromptProvider({ children }: { children: React.ReactNode }) {
  const [promptState, setPromptState] = useState<{
    isOpen: boolean;
    message: string;
    isPassword: boolean;
    resolve: ((value: string | null | boolean) => void) | null;
  }>({
    isOpen: false,
    message: "",
    isPassword: false,
    resolve: null,
  });
  
  const [inputValue, setInputValue] = useState("");

  const promptPassword = useCallback((message: string) => {
    return new Promise<string | null>((resolve) => {
      setInputValue("");
      setPromptState({ isOpen: true, message, isPassword: true, resolve: resolve as any });
    });
  }, []);

  const confirmAction = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setPromptState({ isOpen: true, message, isPassword: false, resolve: resolve as any });
    });
  }, []);

  const close = (value: string | null | boolean) => {
    if (promptState.resolve) {
      promptState.resolve(value);
    }
    setPromptState({ isOpen: false, message: "", isPassword: false, resolve: null });
  };

  return (
    <PromptContext.Provider value={{ promptPassword, confirmAction }}>
      {children}
      {promptState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-lg bg-background p-6 shadow-xl border">
            <h3 className="mb-4 text-lg font-medium">{promptState.message}</h3>
            {promptState.isPassword && (
              <Input
                type="password"
                autoFocus
                className="mb-4"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") close(inputValue);
                  if (e.key === "Escape") close(null);
                }}
              />
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => close(promptState.isPassword ? null : false)}>
                Cancel
              </Button>
              <Button onClick={() => close(promptState.isPassword ? inputValue : true)}>
                {promptState.isPassword ? "Submit" : "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </PromptContext.Provider>
  );
}
