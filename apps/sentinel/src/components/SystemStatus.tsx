import type { Violation } from "@/lib/tauri";
import { IconAlertOctagon, IconAlertTriangle, IconCheckCircle } from "./icons";

const CATEGORY_LABELS: Record<Violation["category"], string> = {
  remoteDesktop: "Remote desktop software",
  screenSharing: "Screen sharing app",
  virtualMachine: "Virtual machine tooling",
  aiAssistant: "AI assistant",
  screenCapture: "Screenshot tool",
  automation: "Automation tool",
  communication: "Communication app",
  orphaned: "Orphaned process",
};

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Live status panel: chronological violation feed, newest first. */
export function SystemStatus({ violations }: { violations: Violation[] }) {
  const sorted = [...violations].sort((a, b) => b.detectedAtMs - a.detectedAtMs);

  return (
    <div className="card">
      <div className="card-title">
        <span>Process monitor</span>
        <span className="count">
          {violations.length} event{violations.length === 1 ? "" : "s"}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="empty-state">
          <IconCheckCircle size={32} className="text-muted" />
          <div>
            <div className="empty-state-title">All clear</div>
            <div className="empty-state-subtitle">No prohibited applications detected.</div>
          </div>
        </div>
      ) : (
        <ul className="violation-list">
          {sorted.map((v) => (
            <li key={v.id} className={`violation-row severity-${v.severity}`}>
              <span className={`violation-icon env-icon ${v.severity === "hard" ? "danger" : "warn"}`}>
                {v.severity === "hard" ? <IconAlertOctagon size={17} /> : <IconAlertTriangle size={17} />}
              </span>
              <span className="violation-body">
                <span className="violation-category">
                  {CATEGORY_LABELS[v.category]}
                  {v.terminated ? " · terminated" : ""}
                </span>
                <span className="violation-process">{v.processName}</span>
              </span>
              <span className="violation-time">{fmtTime(v.detectedAtMs)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
