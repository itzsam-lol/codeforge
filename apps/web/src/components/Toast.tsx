"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui";
import { IconCheckCircle, IconAlert, IconHelp, IconX } from "@/components/icons";

type ToastType = "success" | "error" | "info";

interface ToastRecord {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Confirms an action happened, briefly, without adding a persistent inline
 *  banner to the page — for the handful of flows that previously gave no
 *  feedback at all on success (a save/delete that just... silently worked).
 *  Deliberately not used everywhere: a flow that already surfaces its own
 *  result inline (e.g. a freshly-copyable invitation link) doesn't need a
 *  second, redundant confirmation. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const TYPE_STYLES: Record<ToastType, { icon: typeof IconCheckCircle; border: string; iconColor: string }> = {
  success: { icon: IconCheckCircle, border: "border-l-ok", iconColor: "text-ok" },
  error: { icon: IconAlert, border: "border-l-bad", iconColor: "text-bad" },
  info: { icon: IconHelp, border: "border-l-accent", iconColor: "text-accent" },
};

const DURATION_MS = 4000;
const EXIT_MS = 180;

function ToastItem({ toast, onRemove }: { toast: ToastRecord; onRemove: () => void }) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remainingRef = useRef(DURATION_MS);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestDismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(onRemove, EXIT_MS);
  }, [onRemove]);

  // Plain setTimeout-driven auto-dismiss (not framer-motion's exit
  // lifecycle) — paused while hovered, resuming with whatever time was
  // left rather than restarting the full duration.
  useEffect(() => {
    if (paused || leaving) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (paused) remainingRef.current -= Date.now() - startRef.current;
      return;
    }
    startRef.current = Date.now();
    timerRef.current = setTimeout(requestDismiss, Math.max(remainingRef.current, 300));
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [paused, leaving, requestDismiss]);

  const { icon: Icon, border, iconColor } = TYPE_STYLES[toast.type];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="status"
      className={cn(
        "cf-elevation-2 pointer-events-auto flex w-full items-start gap-2.5 rounded-container border-l-4 bg-surface-container-lowest p-3.5 pr-2.5 transition-all duration-200 ease-out",
        border,
        leaving ? "-translate-x-2 opacity-0" : "cf-toast-in"
      )}
    >
      <Icon size={17} className={cn("mt-0.5 shrink-0", iconColor)} />
      <p className="flex-1 pt-0.5 text-sm text-on-surface">{toast.message}</p>
      <button
        onClick={requestDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-control p-1 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const overlay = (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[200] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-4 sm:w-96"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={() => remove(t.id)} />
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted ? createPortal(overlay, document.body) : null}
    </ToastContext.Provider>
  );
}
