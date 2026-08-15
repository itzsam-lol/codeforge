import type { Violation } from "@/lib/tauri";
import { IconAlertOctagon } from "./icons";

/**
 * Fullscreen red warning for the most recent hard violation — mirrors the
 * spec's "Prohibited application detected" overlay. Phase 2 only shows it;
 * it doesn't yet block/pause a test (there's no test-taking flow here to
 * block — that's Phase 10's job, reusing apps/web's TestRunner).
 */
export function ViolationAlert({ violation, onDismiss }: { violation: Violation; onDismiss: () => void }) {
  return (
    <div className="alert-overlay">
      <div className="alert-card">
        <span className="alert-icon">
          <IconAlertOctagon size={26} />
        </span>
        <h1 className="alert-title">Prohibited application detected</h1>
        <p className="alert-body">
          <strong>{violation.processName}</strong> was flagged and reported to your test session.
          {violation.terminated ? " It has been closed automatically." : ""}
        </p>
        <button className="btn" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
