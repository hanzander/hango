"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

type Toast = {
  id: string;
  message: string;
  tone?: "default" | "success" | "danger";
};

type ToastContextValue = {
  toast: (message: string, tone?: Toast["tone"]) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast["tone"] = "default") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-72 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow-xl",
              t.tone === "success" &&
                "border-emerald-500/30 bg-emerald-500/15 text-emerald-50",
              t.tone === "danger" &&
                "border-red-500/30 bg-red-500/15 text-red-50",
              (!t.tone || t.tone === "default") &&
                "border-border bg-bg-elevated text-text",
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (message: string) => {
        console.info(message);
      },
    };
  }
  return ctx;
}
