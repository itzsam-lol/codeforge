"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { HqPermission } from "@/lib/permissions";
import { hqApi, logout, type HqStaffUser } from "@/lib/api";
import { Spinner, cn } from "@/components/ui";
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

function can(staff: HqStaffUser, ...keys: HqPermission[]): boolean {
  if (staff.role === "owner") return true;
  if (staff.permissions.length === 0) return true;
  return keys.some((k) => staff.permissions.includes(k));
}

function navFor(staff: HqStaffUser): { href: string; label: string }[] {
  const items: { href: string; label: string }[] = [];
  if (can(staff, "clients")) items.push({ href: "/clients", label: "Clients" });
  if (can(staff, "leads")) items.push({ href: "/leads", label: "Leads" });
  if (can(staff, "support")) items.push({ href: "/support", label: "Support" });
  if (staff.role === "owner") items.push({ href: "/team", label: "Team" });
  return items;
}

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [staff, setStaff] = useState<HqStaffUser | null>(null);
  const [theme, setTheme] = useTheme();

  useEffect(() => {
    hqApi<{ staff: HqStaffUser }>("/api/auth/me")
      .then((d) => setStaff(d.staff))
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!staff) return <Spinner label="Loading console…" />;

  const nav = navFor(staff);

  return (
    <div data-theme={theme === "dark" ? "hq-dark" : undefined} className="flex min-h-screen bg-surface">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest md:flex">
        <div className="px-5 py-5">
          <span className="text-headline-sm text-on-surface">CodeForge HQ</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {nav.map((item) => {
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
        </nav>
        <div className="border-t border-outline-variant p-4">
          <div className="flex items-center justify-between gap-2">
            <Link href="/account" className="min-w-0 rounded-control hover:opacity-80">
              <div className="truncate text-sm font-medium text-on-surface">{staff.name}</div>
              <div className="truncate text-xs text-on-surface-variant">{staff.role === "owner" ? "Owner" : "Staff"}</div>
            </Link>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="shrink-0 rounded-control p-1.5 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <IconSun /> : <IconMoon />}
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
      </aside>

      <div className="min-w-0 flex-1">
        <main key={pathname} className="cf-rise p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
