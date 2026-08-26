import type { Violation } from "@/lib/tauri";
import { Card, EmptyState } from "./ui";
import { IconAlert } from "./icons";

const CATEGORY_LABELS: Record<Violation["category"], string> = {
  remoteDesktop: "Remote desktop software",
  screenSharing: "Screen sharing app",
  virtualMachine: "Virtual machine tooling",
  aiAssistant: "AI assistant",
  screenCapture: "Screenshot tool",
  automation: "Automation tool",
  communication: "Communication app",
  orphaned: "Orphaned process",
  remoteInputInjection: "Input-injection tooling",
};

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Live status panel: chronological violation feed, newest first. */
export function SystemStatus({ violations }: { violations: Violation[] }) {
  const sorted = [...violations].sort((a, b) => b.detectedAtMs - a.detectedAtMs);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-headline-sm">Process monitor</span>
        <span className="text-xs text-on-surface-variant">
          {violations.length} event{violations.length === 1 ? "" : "s"}
        </span>
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="All clear" hint="No prohibited applications detected." />
      ) : (
        <ul className="mt-3 space-y-1.5">
          {sorted.map((v) => (
            <li
              key={v.id}
              className={
                "flex items-start gap-3 rounded-control px-3 py-2.5 " +
                (v.severity === "hard" ? "bg-bad-bg" : "bg-warn-bg")
              }
            >
              <span className={v.severity === "hard" ? "mt-0.5 text-bad" : "mt-0.5 text-warn"}>
                <IconAlert size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {CATEGORY_LABELS[v.category]}
                  {v.terminated ? " · terminated" : ""}
                </span>
                <span className="block truncate font-mono text-xs text-on-surface-variant">{v.processName}</span>
              </span>
              <span className="shrink-0 text-xs text-on-surface-variant">{fmtTime(v.detectedAtMs)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
