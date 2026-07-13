"use client";

import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/components/ui";

interface TabsContext {
  value: string;
  setValue: (v: string) => void;
  name: string;
}

const Ctx = createContext<TabsContext | null>(null);

export function Tabs({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const name = useId();
  return (
    <Ctx.Provider value={{ value, setValue: onChange, name }}>
      <div className={className}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabList({ children }: { children: ReactNode }) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = Array.from(
      listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []
    );
    const currentIndex = tabs.findIndex((t) => t === document.activeElement);
    if (currentIndex === -1) return;
    e.preventDefault();
    const next = e.key === "ArrowRight" ? (currentIndex + 1) % tabs.length : (currentIndex - 1 + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto border-b border-outline-variant"
    >
      {children}
    </div>
  );
}

export function Tab({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Tab must be used within Tabs");
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${ctx.name}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${ctx.name}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      className={cn(
        "relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors duration-150",
        active ? "text-accent" : "text-on-surface-variant hover:text-on-surface"
      )}
    >
      {children}
      {active && (
        <motion.div
          layoutId={`${ctx.name}-underline`}
          className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        />
      )}
    </button>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("TabPanel must be used within Tabs");
  if (ctx.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${ctx.name}-panel-${value}`}
      aria-labelledby={`${ctx.name}-tab-${value}`}
      className="cf-fade-in"
    >
      {children}
    </div>
  );
}
