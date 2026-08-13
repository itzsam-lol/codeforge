"use client";

import { useEffect, useState, type CSSProperties } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { staffApi, logout, type StaffUser } from "@/lib/api";
import { can } from "@/lib/permissions";
import { Spinner, cn } from "@/components/ui";
import { IconMenu, IconMoon, IconSun, IconX } from "@/components/icons";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/CommandPalette";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBranding } from "@/lib/branding";
import { titleCase } from "@/lib/format";
import { useTheme } from "@/lib/theme";

interface NavItem {
  href: string;
  label: string;
}
interface NavSection {
  label: string;
  items: NavItem[];
}

function navFor(user: StaffUser): NavSection[] {
  const sections: NavSection[] = [{ label: "Workspace", items: [{ href: "/dashboard", label: "Dashboard" }] }];

  const hiring: NavItem[] = [];
  if (user.role !== "reviewer" && can(user, "questions")) hiring.push({ href: "/questions", label: "Question bank" });
  if (user.role !== "reviewer" && can(user, "tests", "invitations", "results", "analytics")) {
    hiring.push({ href: "/tests", label: "Tests" });
  }
  if (hiring.length > 0) sections.push({ label: "Hiring", items: hiring });

  const comms: NavItem[] = [];
  if (can(user, "support")) comms.push({ href: "/support", label: "Support" });
  if (comms.length > 0) sections.push({ label: "Communication", items: comms });

  const billing: NavItem[] = [];
  if (can(user, "billing")) billing.push({ href: "/billing", label: "Billing" });
  if (billing.length > 0) sections.push({ label: "Billing", items: billing });

  const admin: NavItem[] = [];
  // Matches the backend's requirePermission("settings") gate on
  // GET /api/audit-log exactly, now that that route is permission-gated.
  if (can(user, "settings")) {
    admin.push({ href: "/activity", label: "Activity" });
    admin.push({ href: "/settings", label: "Settings" });
  }
  if (user.role === "super_admin") admin.push({ href: "/settings/team", label: "Team" });
  if (admin.length > 0) sections.push({ label: "Administration", items: admin });

  return sections;
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

  const navSections = navFor(user);
  const flatNav = navSections.flatMap((s) => s.items);

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

      {/* Search, then account — both up top, mirroring how a console-style
          app surfaces "find anything" and "who am I" before the nav list,
          rather than burying account/sign-out at the very bottom. */}
      <div className="px-3 pb-3">
        <CommandPalette items={[...flatNav, { href: "/account", label: "My account" }]} />
      </div>

      <div className="border-b border-outline-variant px-3 pb-3">
        <div className="flex items-center justify-between gap-2 rounded-control bg-surface-container px-3 py-2">
          <Link href="/account" className="min-w-0 hover:opacity-80">
            <div className="truncate text-sm font-medium text-on-surface">{user.name}</div>
            <div className="truncate text-xs text-on-surface-variant">{titleCase(user.role)}</div>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-control p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
          </div>
        </div>
        <button
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
          className="mt-1.5 w-full rounded-control px-1 py-1 text-left text-xs font-medium text-on-surface-variant hover:text-rose-600"
        >
          Sign out
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                // "/settings" and "/settings/team" share a prefix; match
                // exactly for the parent so both don't light up together.
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
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <div
      data-theme={theme === "dark" ? "recruiter-dark" : "recruiter"}
      style={accentStyle}
      className="flex min-h-screen bg-surface"
    >
      {/* Static sidebar, md and up — sticky + viewport-height so it never
          stretches to match a tall scrollable page; its own nav list
          scrolls internally instead if it ever overflows. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest md:flex">
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
