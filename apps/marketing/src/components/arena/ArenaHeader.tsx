"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Trophy, LogOut } from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import { useArenaAuth } from "@/lib/arenaAuthContext";
import { cn } from "@/lib/utils";

const navItems = [
  { name: "Contests", href: "/arena/contests" },
  { name: "Practice", href: "/arena/practice" },
  { name: "Leaderboard", href: "/arena/leaderboard" },
];

export function ArenaHeader() {
  const pathname = usePathname();
  const { user, loading, logout } = useArenaAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05070f]/90 backdrop-blur-lg">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-8">
          <Link href="/arena" aria-label="CodeForge Arena home" className="flex items-center gap-2">
            <Wordmark dark />
            <span className="hidden items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-soft sm:inline-flex">
              <Trophy className="size-3" /> Arena
            </span>
          </Link>
          <ul className="hidden items-center gap-6 text-sm font-medium lg:flex">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "transition-colors duration-150",
                    pathname?.startsWith(item.href) ? "text-white" : "text-slate-400 hover:text-white"
                  )}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          {loading ? null : user ? (
            <>
              <Link
                href={`/arena/profile/${user.handle}`}
                className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
              >
                <span className="font-medium">{user.name}</span>
                <span className="text-accent-soft">{user.rating}</span>
              </Link>
              <button
                onClick={() => void logout()}
                aria-label="Sign out"
                className="rounded-full p-2 text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <LogOut className="size-4" />
              </button>
            </>
          ) : (
            <>
              <Link href="/arena/auth/login" className="text-sm font-medium text-slate-300 hover:text-white">
                Sign in
              </Link>
              <Button href="/arena/auth/register" size="sm">
                Join Arena
              </Button>
            </>
          )}
        </div>

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          className="p-2 text-white lg:hidden"
        >
          {menuOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>

      {menuOpen ? (
        <div className="border-t border-white/10 bg-[#05070f] px-6 py-4 lg:hidden">
          <ul className="space-y-3 text-sm font-medium">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block text-slate-300 hover:text-white" onClick={() => setMenuOpen(false)}>
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2">
            {loading ? null : user ? (
              <>
                <Link href={`/arena/profile/${user.handle}`} className="text-sm text-slate-300">
                  {user.name} · {user.rating}
                </Link>
                <Button variant="outline" size="sm" onClick={() => void logout()}>
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Button href="/arena/auth/login" variant="outline" size="sm">
                  Sign in
                </Button>
                <Button href="/arena/auth/register" size="sm">
                  Join Arena
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
