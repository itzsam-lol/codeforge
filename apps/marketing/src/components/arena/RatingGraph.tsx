"use client";

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ARENA_TIERS } from "@/lib/arenaTiers";

export interface RatingPoint {
  date: string;
  contestTitle: string;
  rating: number;
  delta: number;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TooltipContent({ active, payload }: { active?: boolean; payload?: { payload: RatingPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0d1a] px-3 py-2 text-xs shadow-xl">
      <div className="font-medium text-white">{p.contestTitle}</div>
      <div className="mt-0.5 text-slate-400">{fmtDate(p.date)}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono font-semibold text-white">{p.rating}</span>
        <span className={p.delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
          {p.delta >= 0 ? "+" : ""}
          {p.delta}
        </span>
      </div>
    </div>
  );
}

/** Codeforces-style rating-over-time line chart — one point per contest. */
export function RatingGraph({ history }: { history: RatingPoint[] }) {
  if (history.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-500">No rated contests yet.</p>;
  }

  const ratings = history.map((h) => h.rating);
  const min = Math.min(...ratings, 1100);
  const max = Math.max(...ratings, 1200);
  const pad = Math.max(50, Math.round((max - min) * 0.15));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={history} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          {ARENA_TIERS.filter(([threshold]) => threshold > 0 && threshold > min - pad && threshold < max + pad).map(
            ([threshold, name]) => (
              <ReferenceLine
                key={threshold}
                y={threshold}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="3 3"
                label={{ value: name, position: "insideTopRight", fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              />
            )
          )}
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
          />
          <YAxis
            domain={[min - pad, max + pad]}
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<TooltipContent />} cursor={{ stroke: "rgba(255,255,255,0.15)" }} />
          <Line
            type="monotone"
            dataKey="rating"
            stroke="var(--color-accent-soft, #b4a8ff)"
            strokeWidth={2}
            dot={{ r: 3, fill: "#b4a8ff", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
