import { notFound } from "next/navigation";

const HQ_API_ORIGIN = process.env.HQ_API_ORIGIN ?? "http://localhost:4100";

interface StatusPayload {
  companyName: string;
  healthy: boolean | null;
  lastCheckedAt: string | null;
  uptimePercent30d: number | null;
  days: { date: string; status: "up" | "down" | "unknown" }[];
}

async function fetchStatus(clientId: string): Promise<StatusPayload | null> {
  try {
    const res = await fetch(`${HQ_API_ORIGIN}/api/status/${clientId}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const DAY_COLOR: Record<StatusPayload["days"][number]["status"], string> = {
  up: "#22c55e",
  down: "#f43f5e",
  unknown: "#e2e8f0",
};

export default async function StatusPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const status = await fetchStatus(clientId);
  if (!status) notFound();

  return (
    <main className="flex min-h-screen justify-center bg-surface px-4 py-16">
      <div className="w-full max-w-xl">
        <h1 className="text-headline-md text-on-surface">{status.companyName} status</h1>

        <div className="mt-6 flex items-center gap-3 rounded-container bg-surface-container-lowest p-5">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: status.healthy === null ? "#94a3b8" : status.healthy ? "#22c55e" : "#f43f5e" }}
          />
          <div>
            <div className="font-medium text-on-surface">
              {status.healthy === null
                ? "No data yet"
                : status.healthy
                  ? "All systems operational"
                  : "Experiencing an outage"}
            </div>
            {status.lastCheckedAt ? (
              <div className="text-xs text-on-surface-variant">
                Last checked {new Date(status.lastCheckedAt).toLocaleString()}
              </div>
            ) : null}
          </div>
          {status.uptimePercent30d != null ? (
            <div className="ml-auto text-right">
              <div className="text-lg font-semibold text-on-surface">{status.uptimePercent30d}%</div>
              <div className="text-xs text-on-surface-variant">30-day uptime</div>
            </div>
          ) : null}
        </div>

        <div className="mt-6 rounded-container bg-surface-container-lowest p-5">
          <div className="mb-2 text-xs font-medium text-on-surface-variant">Last 90 days</div>
          <div className="flex gap-0.5">
            {status.days.map((d) => (
              <span
                key={d.date}
                title={`${d.date}: ${d.status}`}
                className="h-6 flex-1 rounded-sm"
                style={{ backgroundColor: DAY_COLOR[d.status] }}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-on-surface-variant">
            <span>{status.days[0]?.date}</span>
            <span>Today</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-on-surface-variant">Powered by CodeForge</p>
      </div>
    </main>
  );
}
