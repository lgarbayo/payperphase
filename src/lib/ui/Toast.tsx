"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cx } from "./cx";

type Toast = { id: number; text: string; tone: "info" | "success" | "error" };
const Ctx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto rounded-[var(--ppp-radius-sm)] px-4 py-2 text-sm font-medium shadow-lg",
              // Dark theme: the ink token is near-white, so each tone sets its own readable text colour.
              t.tone === "success" && "bg-status-paid text-[#04140b]",
              t.tone === "error" && "bg-status-overdue text-white",
              t.tone === "info" && "border border-border bg-surface-2 text-ink",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  return useContext(Ctx);
}
