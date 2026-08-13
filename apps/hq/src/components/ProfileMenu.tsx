"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconLogOut, IconUser } from "@/components/icons";

/**
 * Top-bar avatar + dropdown (My account / Sign out) — the profile-access
 * point moved here from the old sidebar profile card. Portal-rendered for
 * the same reason as NotificationBell/CommandPalette: an absolute-in-
 * relative dropdown can end up trapped behind page content that creates
 * its own stacking context.
 */
export function ProfileMenu({
  name,
  subtitle,
  onSignOut,
}: {
  name: string;
  subtitle: string;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = name.trim().charAt(0).toUpperCase() || "?";

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, right: pos.right }}
            className="cf-elevation-2 fixed z-[100] w-56 rounded-container p-1.5"
          >
            <div className="border-b border-outline-variant px-2.5 py-2">
              <div className="truncate text-sm font-medium text-on-surface">{name}</div>
              <div className="truncate text-xs text-on-surface-variant">{subtitle}</div>
            </div>
            <div className="pt-1">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-control px-2.5 py-2 text-sm text-on-surface hover:bg-surface-container-low"
                role="menuitem"
              >
                <IconUser size={15} />
                My account
              </Link>
              <button
                onClick={() => {
                  setOpen(false);
                  onSignOut();
                }}
                className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-sm text-on-surface hover:bg-surface-container-low"
                role="menuitem"
              >
                <IconLogOut size={15} />
                Sign out
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white hover:opacity-90"
      >
        {initial}
      </button>
      {menu}
    </>
  );
}
