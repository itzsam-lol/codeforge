"use client";

import { useEffect, useState, type CSSProperties } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { staffApi, logout, type StaffUser } from "@/lib/api";
import { can } from "@/lib/permissions";
import { Spinner, cn } from "@/components/ui";
import { IconMenu, IconMoon, IconSun, IconX } from "@/components/icons";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBranding } from "@/lib/branding";
import { titleCase } from "@/lib/format";
import { useTheme } from "@/lib/theme";

function navFor(user: StaffUser): { href: string; label: string }[] {
  const items = [{ href: "/dashboard", label: "Dashboard" }];
  if (user.role !== "reviewer" && can(user, "questions")) {
    items.push({ href: "/questions", label: "Question bank" });
  }
  if (user.role !== "reviewer" && can(user, "tests", "invitations", "results", "analytics")) {
    items.push({ href: "/tests", label: "Tests" });
  }
  if (can(user, "support")) {
    items.push({ href: "/support", label: "Support" });
  }
  // Matches the backend's requirePermission("settings") gate on
  // GET /api/audit-log exactly, now that that route is permission-gated.
  if (can(user, "settings")) {
    items.push({ href: "/activity", label: "Activity" });
    items.push({ href: "/settings", label: "Settings" });
  }
  if (user.role === "super_admin") {
    items.push({ href: "/settings/team", label: "Team" });
  }
  return items;
}

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: userData, error: userErr } = useSWR<{ user: StaffUser }>("/api/auth/me", staffApi);
  const user = userData?.user ?? null;
  const [navOpen, setNavOpen] = useState(false);
  const branding = usePublicBranding();
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    if (userErr) router.replace("/login");
  }, [userErr, router]);

  // Close the mobile drawer on every route change.
  useEffect(() => setNavOpen(false), [pathname]);

  if (!user) return <Spinner label="Loading workspace…" />;

  const nav = navFor(user);

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
        {nav.map((item) => {
          // "/settings" and "/settings/team" share a prefix; match exactly
          // for the parent so both don't light up together on the team page.
          const active =
            item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-accent/10 text-accent"
                  : "text-on-surface-variant hover:translate-x-0.5 hover:bg-surface-container-low"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-outline-variant p-4">
        <div className="flex items-center justify-between gap-2">
          <Link href="/account" className="min-w-0 rounded-control hover:opacity-80">
            <div className="truncate text-sm font-medium text-on-surface">{user.name}</div>
            <div className="truncate text-xs text-on-surface-variant">{titleCase(user.role)}</div>
          </Link>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="shrink-0 rounded-control p-1.5 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
        </div>
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
    <div
      data-theme={theme === "dark" ? "recruiter-dark" : "recruiter"}
      style={accentStyle}
      className="flex min-h-screen bg-surface"
    >
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
