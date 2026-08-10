"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { staffApi, logout, type StaffUser } from "@/lib/api";
import { Spinner, cn } from "@/components/ui";
import { IconMenu, IconX } from "@/components/icons";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBranding } from "@/lib/branding";
import { titleCase } from "@/lib/format";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/questions", label: "Question bank" },
  { href: "/tests", label: "Tests" },
  { href: "/activity", label: "Activity" },
  { href: "/settings", label: "Settings" },
];

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const branding = usePublicBranding();

  useEffect(() => {
    staffApi<{ user: StaffUser }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => router.replace("/login"));
  }, [router]);

  // Close the mobile drawer on every route change.
  useEffect(() => setNavOpen(false), [pathname]);

  if (!user) return <Spinner label="Loading workspace…" />;

  // A client's brandingConfig.accentColor overrides these two custom
  // properties on the theme root, so it cascades to every bg-accent/
  // text-accent/border-accent utility in the recruiter dashboard, not just
  // the candidate flow.
  const accentStyle: CSSProperties | undefined = branding.accentColor
    ? ({
        "--color-accent": branding.accentColor,
        "--color-accent-hover": branding.accentColorHover ?? branding.accentColor,
      } as CSSProperties)
    : undefined;

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-5 py-5">
        <Wordmark branding={branding} />
        <button
          onClick={() => setNavOpen(false)}
          className="text-on-surface-variant hover:text-on-surface md:hidden"
          aria-label="Close menu"
        >
          <IconX size={20} />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "block rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
              pathname.startsWith(item.href)
                ? "bg-accent/10 text-accent"
                : "text-on-surface-variant hover:translate-x-0.5 hover:bg-surface-container-low"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-outline-variant p-4">
        <div className="truncate text-sm font-medium text-on-surface">{user.name}</div>
        <div className="truncate text-xs text-on-surface-variant">{titleCase(user.role)}</div>
        <button
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
          className="mt-2 text-xs font-medium text-on-surface-variant hover:text-rose-600"
        >
          Sign out
        </button>
      </div>
    </>
  );

  return (
    <div data-theme="recruiter" style={accentStyle} className="flex min-h-screen bg-surface">
      {/* Static sidebar, md and up */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest md:flex">
        {sidebarContent}
      </aside>

      {/* Off-canvas drawer, below md */}
      {navOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="cf-fade-in absolute inset-0 bg-black/40"
            onClick={() => setNavOpen(false)}
          />
          <aside className="relative flex h-full w-64 max-w-[80vw] flex-col border-r border-outline-variant bg-surface-container-lowest shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest px-4 py-3 md:hidden">
          <button
            onClick={() => setNavOpen(true)}
            className="text-on-surface-variant hover:text-on-surface"
            aria-label="Open menu"
          >
            <IconMenu size={22} />
          </button>
          <Wordmark branding={branding} size="sm" />
        </div>
        {/* CSS-only route-change fade (cf-rise, defined in globals.css) rather
            than framer-motion's AnimatePresence: mode="wait" there delayed
            mounting the next page until the previous one finished exiting,
            adding real navigation latency for a purely cosmetic transition. */}
        <main key={pathname} className="cf-rise p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
