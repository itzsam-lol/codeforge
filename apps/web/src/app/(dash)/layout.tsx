"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { staffApi, logout, type StaffUser } from "@/lib/api";
import { Spinner, cn } from "@/components/ui";
import { titleCase } from "@/lib/format";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/questions", label: "Question bank" },
  { href: "/tests", label: "Tests" },
];

export default function DashLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<StaffUser | null>(null);

  useEffect(() => {
    staffApi<{ user: StaffUser }>("/api/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => router.replace("/login"));
  }, [router]);

  if (!user) return <Spinner label="Loading workspace…" />;

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5 text-lg font-bold tracking-tight">
          Code<span className="text-indigo-600">Forge</span>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                pathname.startsWith(item.href)
                  ? "bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-100"
                  : "text-slate-600 hover:translate-x-0.5 hover:bg-slate-100"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="truncate text-sm font-medium text-slate-800">{user.name}</div>
          <div className="truncate text-xs text-slate-400">{titleCase(user.role)}</div>
          <button
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
            className="mt-2 text-xs font-medium text-slate-500 hover:text-rose-600"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main key={pathname} className="cf-fade-in min-w-0 flex-1 p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
