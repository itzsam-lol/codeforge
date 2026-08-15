import type { VmDetectionResult } from "@/lib/tauri";
import { IconAlertOctagon, IconCheckCircle, IconMonitor } from "./icons";

export function VmStatus({ result, error }: { result: VmDetectionResult | null; error: string | null }) {
  return (
    <div className="card">
      <div className="card-title">
        <span>Environment</span>
        {result ? <span className="count">{result.confidence}% confidence</span> : null}
      </div>

      {error ? (
        <p className="error-banner">VM check error: {error}</p>
      ) : !result ? (
        <p className="text-muted">Checking for virtualization&hellip;</p>
      ) : (
        <>
          <div className="env-row">
            {result.isVm ? (
              <IconAlertOctagon size={22} className="env-icon danger" />
            ) : (
              <IconCheckCircle size={22} className="env-icon ok" />
            )}
            <div>
              <div className="env-title">{result.isVm ? "Virtual machine detected" : "Physical machine"}</div>
              <div className="env-subtitle">
                {result.isVm
                  ? "This test would be blocked from starting on a real deployment."
                  : "No virtualization signals found."}
              </div>
            </div>
          </div>

          {result.evidence.length > 0 ? (
            <ul className="evidence-list">
              {result.evidence.map((line) => (
                <li key={line} className="evidence-item">
                  <IconMonitor size={14} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
