"use client";

import { useMemo } from "react";

export interface HeatmapDay {
  date: string;
  count: number;
}

const DAY_MS = 86_400_000;
const DOW_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function colorFor(count: number): string {
  if (count <= 0) return "bg-white/5";
  if (count === 1) return "bg-emerald-500/20";
  if (count <= 3) return "bg-emerald-500/40";
  if (count <= 5) return "bg-emerald-500/60";
  return "bg-emerald-500/90";
}

function fmtLong(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** GitHub-style 52-53-week x 7-day contribution calendar, Monday-first. */
export function ActivityHeatmap({ data }: { data: HeatmapDay[] }) {
  const weeks = useMemo(() => {
    const counts = new Map(data.map((d) => [d.date, d.count]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today.getTime() - 364 * DAY_MS);
    const startDow = (start.getDay() + 6) % 7; // 0 = Monday
    const gridStart = new Date(start.getTime() - startDow * DAY_MS);

    const days: { date: Date; count: number }[] = [];
    for (let t = gridStart.getTime(); t <= today.getTime(); t += DAY_MS) {
      const d = new Date(t);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: d, count: counts.get(key) ?? 0 });
    }

    const built: { date: Date; count: number }[][] = [];
    for (let i = 0; i < days.length; i += 7) built.push(days.slice(i, i + 7));
    return built;
  }, [data]);

  const monthMarkers = useMemo(() => {
    const markers: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const month = week[0].date.getMonth();
      if (month !== lastMonth) {
        markers.push({ weekIndex: i, label: MONTH_LABELS[month] });
        lastMonth = month;
      }
    });
    return markers;
  }, [weeks]);

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex gap-2" style={{ minWidth: weeks.length * 14 + 32 }}>
        <div className="grid grid-rows-7 gap-1 pt-4 text-[10px] text-slate-500">
          {DOW_LABELS.map((label, i) => (
            <span key={i} className="flex h-3 items-center">
              {label}
            </span>
          ))}
        </div>
        <div>
          <div className="relative h-3.5 text-[10px] text-slate-500">
            {monthMarkers.map((m) => (
              <span key={m.weekIndex} className="absolute" style={{ left: m.weekIndex * 14 }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="grid grid-flow-col grid-rows-7 gap-1">
            {weeks.map((week, wi) =>
              week.map((day, di) => (
                <div
                  key={`${wi}-${di}`}
                  title={`${day.count} submission${day.count === 1 ? "" : "s"} on ${fmtLong(day.date)}`}
                  className={`size-3 rounded-sm ${colorFor(day.count)}`}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
