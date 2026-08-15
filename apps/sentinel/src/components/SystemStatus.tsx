import type { Violation } from "@/lib/tauri";

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
  return new Date(ms).toLocaleTimeString();
}

/** Live status panel: violation count + a chronological list, newest first. */
export function SystemStatus({ violations }: { violations: Violation[] }) {
  const sorted = [...violations].sort((a, b) => b.detectedAtMs - a.detectedAtMs);

  return (
    <div style={{ width: "100%", maxWidth: 420, fontSize: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", color: "#94a3b8", marginBottom: 8 }}>
        <span>Process monitor</span>
        <span>{violations.length} event{violations.length === 1 ? "" : "s"}</span>
      </div>
      {sorted.length === 0 ? (
        <p style={{ color: "#64748b" }}>No violations detected.</p>
      ) : (
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {sorted.map((v) => (
            <li
              key={v.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                background: v.severity === "hard" ? "rgba(248,113,113,0.12)" : "rgba(148,163,184,0.1)",
                color: v.severity === "hard" ? "#f87171" : "#cbd5e1",
              }}
            >
              <span>
                {CATEGORY_LABELS[v.category]} &middot; {v.processName}
                {v.terminated ? " (terminated)" : ""}
              </span>
              <span style={{ color: "#64748b", flexShrink: 0 }}>{fmtTime(v.detectedAtMs)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
