"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { staffApi } from "@/lib/api";
import { IconBell } from "@/components/icons";
import { fmtDateTime } from "@/lib/format";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: countData, mutate: mutateCount } = useSWR<{ count: number }>(
    "/api/notifications/unread-count",
    staffApi,
    { refreshInterval: 30_000 }
  );
  const { data, mutate } = useSWR<{ notifications: Notification[] }>(
    open ? "/api/notifications" : null,
    staffApi
  );
  const count = countData?.count ?? 0;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function openNotification(n: Notification) {
    if (!n.readAt) {
      await staffApi(`/api/notifications/${n.id}/read`, { method: "POST" });
      mutate();
      mutateCount();
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    await staffApi("/api/notifications/read-all", { method: "POST" });
    mutate();
    mutateCount();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-control p-1.5 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
        aria-label="Notifications"
      >
        <IconBell size={16} />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-container bg-surface-container-lowest p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs font-semibold text-on-surface">Notifications</span>
            {count > 0 ? (
              <button onClick={markAllRead} className="text-xs font-medium text-accent hover:text-accent-hover">
                Mark all read
              </button>
            ) : null}
          </div>
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {!data ? (
              <p className="px-2 py-4 text-center text-xs text-on-surface-variant">Loading…</p>
            ) : data.notifications.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-on-surface-variant">Nothing yet.</p>
            ) : (
              data.notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => openNotification(n)}
                  className={`block w-full rounded-control p-2 text-left text-xs hover:bg-surface-container-low ${
                    n.readAt ? "" : "bg-accent/5"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium text-on-surface">
                    {!n.readAt ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /> : null}
                    {n.title}
                  </div>
                  <div className="mt-0.5 truncate text-on-surface-variant">{n.body}</div>
                  <div className="mt-0.5 text-on-surface-variant/70">{fmtDateTime(n.createdAt)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
