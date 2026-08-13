"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { HqPermission } from "@/lib/permissions";
import { hqApi, logout, type HqStaffUser } from "@/lib/api";
import { Spinner, cn } from "@/components/ui";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/CommandPalette";
import { useTheme } from "@/lib/theme";

function IconSun() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function IconMoon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function can(staff: HqStaffUser, ...keys: HqPermission[]): boolean {
  if (staff.role === "owner") return true;
  if (staff.permissions.length === 0) return true;
  return keys.some((k) => staff.permissions.includes(k));
}

interface NavItem {
  href: string;
  label: string;
}
interface NavSection {
  label: string;
  items: NavItem[];
}

function navFor(staff: HqStaffUser): NavSection[] {
  const sections: NavSection[] = [];

  const relations: NavItem[] = [];
  if (can(staff, "clients")) relations.push({ href: "/clients", label: "Clients" });
  if (can(staff, "leads")) relations.push({ href: "/leads", label: "Leads" });
  if (relations.length > 0) sections.push({ label: "Client relations", items: relations });

  const comms: NavItem[] = [];
  if (can(staff, "support")) comms.push({ href: "/support", label: "Support" });
  if (comms.length > 0) sections.push({ label: "Communication", items: comms });

  const admin: NavItem[] = [];
  if (staff.role === "owner") admin.push({ href: "/team", label: "Team" });
  if (admin.length > 0) sections.push({ label: "Administration", items: admin });

  return sections;
}

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [staff, setStaff] = useState<HqStaffUser | null>(null);
  const [theme, setTheme] = useTheme();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    hqApi<{ staff: HqStaffUser }>("/api/auth/me")
      .then((d) => setStaff(d.staff))
      .catch(() => router.replace("/login"));
  }, [router]);

  // Close the mobile drawer on every route change.
  useEffect(() => setNavOpen(false), [pathname]);

  if (!staff) return <Spinner label="Loading console…" />;

  const navSections = navFor(staff);
  const flatNav = navSections.flatMap((s) => s.items);

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between px-5 py-5">
        <span className="text-headline-sm text-on-surface">CodeForge HQ</span>
        <button
          onClick={() => setNavOpen(false)}
          className="text-on-surface-variant hover:text-on-surface md:hidden"
          aria-label="Close menu"
        >
          <IconX />
        </button>
      </div>

      <div className="px-3 pb-3">
        <CommandPalette items={[...flatNav, { href: "/account", label: "My account" }]} />
      </div>

      <div className="border-b border-outline-variant px-3 pb-3">
        <div className="flex items-center justify-between gap-2 rounded-control bg-surface-container px-3 py-2">
          <Link href="/account" className="min-w-0 hover:opacity-80">
            <div className="truncate text-sm font-medium text-on-surface">{staff.name}</div>
            <div className="truncate text-xs text-on-surface-variant">{staff.role === "owner" ? "Owner" : "Staff"}</div>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            <NotificationBell />
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-control p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
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
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                      active ? "bg-accent/10 text-accent" : "text-on-surface-variant hover:translate-x-0.5 hover:bg-surface-container-low"
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
    <div data-theme={theme === "dark" ? "hq-dark" : undefined} className="flex min-h-screen bg-surface">
      {/* Sticky + viewport-height so it never stretches to match a tall
          scrollable page; its own nav list scrolls internally if needed. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest md:flex">
        {sidebarContent}
      </aside>

      {/* Off-canvas drawer, below md */}
      {navOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="cf-fade-in absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
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
            <IconMenu />
          </button>
          <span className="text-sm font-semibold text-on-surface">CodeForge HQ</span>
        </div>
        <main key={pathname} className="cf-rise p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
