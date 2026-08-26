import type { InputInjectionResult, VmDetectionResult } from "@/lib/tauri";
import { VmStatus } from "./VmStatus";
import { InputInjectionStatus } from "./InputInjectionStatus";
import { LockdownControl } from "./LockdownControl";
import { Button, Card } from "./ui";
import { IconMonitor } from "./icons";

/**
 * A self-check candidates can run before test day with no server test, no
 * token, and no heartbeat — it reuses the exact same pre-flight checks and
 * lockdown sequence as the real thing (LockdownControl below), just never
 * calls startHeartbeat, so nothing is reported anywhere. This is D2 from the
 * plan; D1 (an org's own real practice Test, sent as a second link in the
 * onboarding email) is the other half and needs no code here.
 */
export function PracticeMode({
  vmResult,
  vmError,
  inputInjectionResult,
  inputInjectionError,
  ready,
  blockedReasons,
  onExit,
}: {
  vmResult: VmDetectionResult | null;
  vmError: string | null;
  inputInjectionResult: InputInjectionResult | null;
  inputInjectionError: string | null;
  ready: boolean;
  blockedReasons: string[];
  onExit: () => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3 p-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
          <IconMonitor size={18} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">Practice mode</div>
          <div className="mt-1 text-sm text-on-surface-variant">
            Run the exact checks and lockdown you'll see on test day. Nothing here is recorded or sent
            anywhere — this is just for you to confirm your machine is ready.
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit
        </Button>
      </Card>

      <VmStatus result={vmResult} error={vmError} />
      <InputInjectionStatus result={inputInjectionResult} error={inputInjectionError} />
      <LockdownControl ready={ready} blockedReasons={blockedReasons} practiceMode />
    </div>
  );
}
