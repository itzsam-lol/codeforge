"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "warning";

interface ToastRecord {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ArenaToastContextValue {
  showToast: (kind: ToastKind, message: string) => void;
}

const ArenaToastContext = createContext<ArenaToastContextValue | null>(null);

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

/** Lightweight toast system, no external dependency — wraps the Arena
 *  layout so any page can fire a notification via useArenaToast(). Used for
 *  submission-graded results (accepted/wrong answer/TLE). */
export function ArenaToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((cur) => [...cur, { id, kind, message }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 5000);
  }, []);

  return (
    <ArenaToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm font-medium shadow-lg backdrop-blur ${KIND_STYLES[t.kind]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ArenaToastContext.Provider>
  );
}

export function useArenaToast(): ArenaToastContextValue {
  const ctx = useContext(ArenaToastContext);
  if (!ctx) throw new Error("useArenaToast must be used within ArenaToastProvider");
  return ctx;
}
