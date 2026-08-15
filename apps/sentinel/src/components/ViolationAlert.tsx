import type { Violation } from "@/lib/tauri";

/**
 * Fullscreen red warning for the most recent hard violation — mirrors the
 * spec's "Prohibited application detected" overlay. Phase 2 only shows it;
 * it doesn't yet block/pause the test (there's no test-taking flow here to
 * block — that's Phase 10's job, reusing apps/web's TestRunner).
 */
export function ViolationAlert({ violation, onDismiss }: { violation: Violation; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "rgba(127, 29, 29, 0.97)",
        color: "white",
        textAlign: "center",
        padding: 24,
        zIndex: 1000,
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Prohibited application detected</h1>
      <p style={{ fontSize: 14, opacity: 0.9 }}>
        {violation.processName} was flagged and reported to your test session.
        {violation.terminated ? " It has been closed automatically." : ""}
      </p>
      <button
        onClick={onDismiss}
        style={{
          marginTop: 8,
          padding: "8px 20px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.4)",
          background: "transparent",
          color: "white",
          fontSize: 13,
          cursor: "pointer",
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
