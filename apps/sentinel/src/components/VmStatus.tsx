import type { VmDetectionResult } from "@/lib/tauri";
import { Card } from "./ui";
import { IconAlert, IconCheckCircle, IconMonitor } from "./icons";

export function VmStatus({ result, error }: { result: VmDetectionResult | null; error: string | null }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-headline-sm">Environment</span>
        {result ? <span className="text-xs text-on-surface-variant">{result.confidence}% confidence</span> : null}
      </div>

      {error ? (
        <p className="mt-3 rounded bg-bad-bg px-3 py-2 text-sm text-bad">VM check error: {error}</p>
      ) : !result ? (
        <p className="mt-3 text-sm text-on-surface-variant">Checking for virtualization&hellip;</p>
      ) : (
        <>
          <div className="mt-3 flex items-start gap-3">
            {result.isVm ? (
              <IconAlert size={22} className="mt-0.5 shrink-0 text-bad" />
            ) : (
              <IconCheckCircle size={22} className="mt-0.5 shrink-0 text-ok" />
            )}
            <div>
              <div className="text-sm font-medium">{result.isVm ? "Virtual machine detected" : "Physical machine"}</div>
              <div className="text-xs text-on-surface-variant">
                {result.isVm
                  ? "This test would be blocked from starting on a real deployment."
                  : "No virtualization signals found."}
              </div>
            </div>
          </div>

          {result.evidence.length > 0 ? (
            <ul className="mt-3 space-y-1.5 border-t border-outline-variant pt-3">
              {result.evidence.map((line) => (
                <li key={line} className="flex items-start gap-2 text-xs text-on-surface-variant">
                  <IconMonitor size={14} className="mt-0.5 shrink-0" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Card>
  );
}
