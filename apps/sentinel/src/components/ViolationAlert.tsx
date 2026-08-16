import type { Violation } from "@/lib/tauri";
import { Button, Card } from "./ui";
import { IconAlert } from "./icons";

/**
 * Fullscreen red warning for the most recent hard violation — mirrors the
 * spec's "Prohibited application detected" overlay. Phase 2 only shows it;
 * it doesn't yet block/pause a test (there's no test-taking flow here to
 * block — that's Phase 10's job, reusing apps/web's TestRunner).
 */
export function ViolationAlert({ violation, onDismiss }: { violation: Violation; onDismiss: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <Card className="cf-scale-in mx-4 max-w-sm p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bad-bg text-bad">
          <IconAlert size={24} />
        </div>
        <h1 className="mt-3 text-headline-sm">Prohibited application detected</h1>
        <p className="mt-2 text-sm text-on-surface-variant">
          <strong className="text-on-surface">{violation.processName}</strong> was flagged and reported to your test
          session.
          {violation.terminated ? " It has been closed automatically." : ""}
        </p>
        <Button variant="secondary" className="mt-4 w-full" onClick={onDismiss}>
          Dismiss
        </Button>
      </Card>
    </div>
  );
}
