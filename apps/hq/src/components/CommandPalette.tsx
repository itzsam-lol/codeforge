"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

export interface CommandItem {
  label: string;
  href: string;
}

/** Cmd/Ctrl+K opens this; Escape or a backdrop click closes it.
 *  Mirrors apps/web's copy exactly. */
export function CommandPalette({ items }: { items: CommandItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    function onGlobalKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onGlobalKeyDown);
    return () => document.removeEventListener("keydown", onGlobalKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  function go(item: CommandItem) {
    setOpen(false);
    router.push(item.href);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[activeIndex];
      if (item) go(item);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-control bg-surface-container px-3 py-1.5 text-xs text-on-surface-variant hover:bg-surface-container-high"
      >
        <span>Jump to…</span>
        <span className="font-mono">⌘K</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[15vh]">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onKeyDown={onKeyDown}
            className="cf-elevation-2 relative w-full max-w-md rounded-container p-2"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to…"
              className="w-full rounded-control bg-surface-container px-3 py-2 text-sm text-on-surface outline-none focus:ring-2 focus:ring-accent"
            />
            <ul className="mt-2 max-h-72 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-xs text-on-surface-variant">No matches</li>
              ) : (
                filtered.map((item, i) => (
                  <li key={item.href}>
                    <button
                      onClick={() => go(item)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={`block w-full rounded-control px-3 py-2 text-left text-sm ${
                        i === activeIndex ? "bg-accent/10 text-accent" : "text-on-surface hover:bg-surface-container-low"
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
