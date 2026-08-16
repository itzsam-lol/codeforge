"use client";

import { useEffect, useState, type CSSProperties, type ComponentType } from "react";
import useSWR from "swr";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { staffApi, logout, type StaffUser } from "@/lib/api";
import { can } from "@/lib/permissions";
import { Spinner, cn } from "@/components/ui";
import {
  IconActivity,
  IconChevronDown,
  IconCode,
  IconDollar,
  IconHelp,
  IconList,
  IconMenu,
  IconMonitor,
  IconMoon,
  IconPanelLeft,
  IconSettings,
  IconSun,
  IconUsers,
  IconX,
  type IconProps,
} from "@/components/icons";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/CommandPalette";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ToastProvider } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";
import { usePublicBranding } from "@/lib/branding";
import { titleCase } from "@/lib/format";
import { useTheme } from "@/lib/theme";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
}
interface NavSection {
  label: string;
  items: NavItem[];
}

function navFor(user: StaffUser): NavSection[] {
  const sections: NavSection[] = [
    { label: "Workspace", items: [{ href: "/dashboard", label: "Dashboard", icon: IconMonitor }] },
  ];

  const hiring: NavItem[] = [];
  if (user.role !== "reviewer" && can(user, "questions")) {
    hiring.push({ href: "/questions", label: "Question bank", icon: IconCode });
  }
  if (user.role !== "reviewer" && can(user, "tests", "invitations", "results", "analytics")) {
    hiring.push({ href: "/tests", label: "Tests", icon: IconList });
  }
  if (hiring.length > 0) sections.push({ label: "Hiring", items: hiring });

  const comms: NavItem[] = [];
  if (can(user, "support")) comms.push({ href: "/support", label: "Support", icon: IconHelp });
  if (comms.length > 0) sections.push({ label: "Communication", items: comms });

  const billing: NavItem[] = [];
  if (can(user, "billing")) billing.push({ href: "/billing", label: "Billing", icon: IconDollar });
  if (billing.length > 0) sections.push({ label: "Billing", items: billing });

  const admin: NavItem[] = [];
  // Matches the backend's requirePermission("settings") gate on
  // GET /api/audit-log exactly, now that that route is permission-gated.
  if (can(user, "settings")) {
    admin.push({ href: "/activity", label: "Activity", icon: IconActivity });
    admin.push({ href: "/settings", label: "Settings", icon: IconSettings });
  }
  if (user.role === "super_admin") admin.push({ href: "/settings/team", label: "Team", icon: IconUsers });
  if (admin.length > 0) sections.push({ label: "Administration", items: admin });

  return sections;
}

const COLLAPSE_KEY = "cf_sidebar_collapsed";
const SECTIONS_KEY = "cf_sidebar_collapsed_sections";
const TOPBAR_H = 56;

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: userData, error: userErr } = useSWR<{ user: StaffUser }>("/api/auth/me", staffApi);
  const user = userData?.user ?? null;
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  const branding = usePublicBranding();
  const [theme, setTheme] = useTheme();

  // Sidebar-collapse and per-section-collapse are user preferences, not
  // session state — persisted so they don't reset on every navigation or
  // reload (HCI: recognition over recall — the user shouldn't have to
  // re-collapse the same section every time they come back).
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

  useEffect(() => {
    if (userErr) router.replace("/login");
  }, [userErr, router]);

  // Close the mobile drawer on every route change.
  useEffect(() => setNavOpen(false), [pathname]);

  // Mirrors the data-theme set on the wrapper div below onto <html> too.
  // CSS custom properties only cascade to DOM descendants, and a React
  // portal (CommandPalette/NotificationBell/ProfileMenu/Toast all render
  // via createPortal to document.body) is a DOM sibling of that div, not a
  // descendant — without this, every portaled overlay would silently fall
  // back to the light-theme variables regardless of the user's actual
  // theme choice. Cleaned up on unmount so a stale dark attribute doesn't
  // leak onto the (unthemed) login page after signing out.
  useEffect(() => {
    const value = theme === "dark" ? "recruiter-dark" : "recruiter";
    document.documentElement.dataset.theme = value;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  if (!user) return <Spinner label="Loading workspace…" />;

  const navSections = navFor(user);
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
                className="flex w-full items-center justify-between rounded-control px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
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
                  // "/settings" and "/settings/team" share a prefix; match
                  // exactly for the parent so both don't light up together.
                  const active =
                    item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
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
    <ToastProvider>
    <div
      data-theme={theme === "dark" ? "recruiter-dark" : "recruiter"}
      style={accentStyle}
      className="flex min-h-screen flex-col bg-surface"
    >
      {/* Horizontal top bar: search, notifications, theme, account — the
          "who am I / find anything" chrome, always visible regardless of
          sidebar collapse state. */}
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
        <Link href="/dashboard" className="shrink-0">
          <Wordmark branding={branding} size="sm" />
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
          <ProfileMenu name={user.name} subtitle={titleCase(user.role)} onSignOut={handleSignOut} />
        </div>
      </header>

      <div className="flex flex-1">
        {/* Static sidebar, md and up — sticky below the top bar + viewport
            height so it never stretches to match a tall scrollable page.
            Collapses to an icon-only rail (width transition), state
            persisted above. */}
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

        {/* Off-canvas drawer, below md */}
        {navOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="cf-fade-in absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
            <aside className="relative flex h-full w-64 max-w-[80vw] flex-col border-r border-outline-variant bg-surface-container-lowest shadow-xl">
              <div className="flex items-center justify-between px-4 py-4">
                <Wordmark branding={branding} size="sm" />
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
          {/* CSS-only route-change fade (cf-rise, defined in globals.css) rather
              than framer-motion's AnimatePresence: mode="wait" there delayed
              mounting the next page until the previous one finished exiting,
              adding real navigation latency for a purely cosmetic transition. */}
          <main key={pathname} className="cf-rise p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </div>
    </ToastProvider>
  );
}
