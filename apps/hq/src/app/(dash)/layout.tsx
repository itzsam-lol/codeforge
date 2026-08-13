"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { HqPermission } from "@/lib/permissions";
import { hqApi, logout, type HqStaffUser } from "@/lib/api";
import { Spinner, cn } from "@/components/ui";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/CommandPalette";
import { ProfileMenu } from "@/components/ProfileMenu";
import { useTheme } from "@/lib/theme";
import {
  IconBuilding,
  IconChevronDown,
  IconGauge,
  IconMenu,
  IconMoon,
  IconPanelLeft,
  IconSun,
  IconTicket,
  IconTrendingUp,
  IconUsers,
  IconX,
  type IconProps,
} from "@/components/icons";

function can(staff: HqStaffUser, ...keys: HqPermission[]): boolean {
  if (staff.role === "owner") return true;
  if (staff.permissions.length === 0) return true;
  return keys.some((k) => staff.permissions.includes(k));
}

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
}
interface NavSection {
  label: string;
  items: NavItem[];
}

function navFor(staff: HqStaffUser): NavSection[] {
  const sections: NavSection[] = [
    { label: "Workspace", items: [{ href: "/dashboard", label: "Dashboard", icon: IconGauge }] },
  ];

  const relations: NavItem[] = [];
  if (can(staff, "clients")) relations.push({ href: "/clients", label: "Clients", icon: IconBuilding });
  if (can(staff, "leads")) relations.push({ href: "/leads", label: "Leads", icon: IconTrendingUp });
  if (relations.length > 0) sections.push({ label: "Client relations", items: relations });

  const comms: NavItem[] = [];
  if (can(staff, "support")) comms.push({ href: "/support", label: "Support", icon: IconTicket });
  if (comms.length > 0) sections.push({ label: "Communication", items: comms });

  const admin: NavItem[] = [];
  if (staff.role === "owner") admin.push({ href: "/team", label: "Team", icon: IconUsers });
  if (admin.length > 0) sections.push({ label: "Administration", items: admin });

  return sections;
}

const COLLAPSE_KEY = "hq_sidebar_collapsed";
const SECTIONS_KEY = "hq_sidebar_collapsed_sections";
const TOPBAR_H = 56;

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [staff, setStaff] = useState<HqStaffUser | null>(null);
  const [theme, setTheme] = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    hqApi<{ staff: HqStaffUser }>("/api/auth/me")
      .then((d) => setStaff(d.staff))
      .catch(() => router.replace("/login"));
  }, [router]);

  // Sidebar-collapse and per-section-collapse are user preferences,
  // persisted so they don't reset on every navigation or reload.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
      const raw = window.localStorage.getItem(SECTIONS_KEY);
      if (raw) setCollapsedSections(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore malformed storage
    }
    setHydrated(true);
  }, []);

  // Close the mobile drawer on every route change.
  useEffect(() => setNavOpen(false), [pathname]);

  if (!staff) return <Spinner label="Loading console…" />;

  const navSections = navFor(staff);
  const flatNav = navSections.flatMap((s) => s.items.map(({ href, label }) => ({ href, label })));

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function toggleSection(label: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      window.localStorage.setItem(SECTIONS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  async function handleSignOut() {
    await logout();
    router.replace("/login");
  }

  const navList = (isRail: boolean) => (
    <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
      {navSections.map((section) => {
        const sectionCollapsed = collapsedSections.has(section.label);
        return (
          <div key={section.label}>
            {isRail ? (
              <div className="my-2 border-t border-outline-variant first:mt-0" />
            ) : (
              <button
                onClick={() => toggleSection(section.label)}
                aria-expanded={!sectionCollapsed}
                className="flex w-full items-center justify-between rounded-control px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/70 transition-colors hover:bg-surface-container-low hover:text-on-surface-variant"
              >
                <span>{section.label}</span>
                <IconChevronDown
                  size={12}
                  className={cn("transition-transform duration-150", sectionCollapsed && "-rotate-90")}
                />
              </button>
            )}
            {isRail || !sectionCollapsed ? (
              <div className="space-y-0.5 pb-2">
                {section.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={isRail ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                        isRail && "justify-center px-2",
                        active
                          ? "bg-accent/10 text-accent"
                          : "text-on-surface-variant hover:bg-surface-container-low hover:translate-x-0.5"
                      )}
                    >
                      <Icon size={16} className="shrink-0" />
                      {!isRail ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div data-theme={theme === "dark" ? "hq-dark" : undefined} className="flex min-h-screen flex-col bg-surface">
      <header
        style={{ height: TOPBAR_H }}
        className="sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-outline-variant bg-surface-container-lowest px-3 sm:px-4"
      >
        <button
          onClick={() => setNavOpen(true)}
          className="text-on-surface-variant hover:text-on-surface md:hidden"
          aria-label="Open menu"
        >
          <IconMenu size={22} />
        </button>
        <button
          onClick={toggleCollapsed}
          className="hidden shrink-0 rounded-control p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface md:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <IconPanelLeft size={18} />
        </button>
        <Link href="/dashboard" className="shrink-0 text-headline-sm text-on-surface">
          CodeForge HQ
        </Link>
        <div className="ml-1 min-w-0 flex-1 sm:max-w-[220px] md:max-w-sm lg:max-w-md">
          <CommandPalette items={[...flatNav, { href: "/account", label: "My account" }]} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <NotificationBell />
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-control p-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
          </button>
          <ProfileMenu name={staff.name} subtitle={staff.role === "owner" ? "Owner" : "Staff"} onSignOut={handleSignOut} />
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={cn(
            "sticky hidden shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest transition-[width] duration-150 md:flex",
            collapsed ? "w-16" : "w-64",
            !hydrated && "invisible"
          )}
          style={{ top: TOPBAR_H, height: `calc(100vh - ${TOPBAR_H}px)` }}
        >
          {navList(collapsed)}
        </aside>

        {navOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="cf-fade-in absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
            <aside className="relative flex h-full w-64 max-w-[80vw] flex-col border-r border-outline-variant bg-surface-container-lowest shadow-xl">
              <div className="flex items-center justify-between px-4 py-4">
                <span className="text-headline-sm text-on-surface">CodeForge HQ</span>
                <button
                  onClick={() => setNavOpen(false)}
                  className="text-on-surface-variant hover:text-on-surface"
                  aria-label="Close menu"
                >
                  <IconX size={20} />
                </button>
              </div>
              {navList(false)}
            </aside>
          </div>
        ) : null}

        <div className="min-w-0 flex-1">
          <main key={pathname} className="cf-rise p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
