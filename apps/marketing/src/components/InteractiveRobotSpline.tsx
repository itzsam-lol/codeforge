"use client";

import { Component, Suspense, lazy, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const Spline = lazy(() => import("@splinetool/react-spline"));

function Fallback({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full items-center justify-center bg-slate-900 text-white", className)}>
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l2-2.647z"
        />
      </svg>
    </div>
  );
}

/**
 * A malformed/unreachable scene URL throws at runtime (not during the lazy
 * import), which Suspense alone does not catch, it would otherwise crash
 * every parent up to the nearest error boundary (here, the whole page).
 * A bad 3D asset should never be able to take down the chat widget around it.
 */
class SplineErrorBoundary extends Component<{ className?: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return <Fallback className={this.props.className} />;
    return this.props.children;
  }
}

export function InteractiveRobotSpline({
  scene,
  className,
}: {
  scene: string;
  className?: string;
}) {
  return (
    <SplineErrorBoundary className={className}>
      <Suspense fallback={<Fallback className={className} />}>
        <Spline scene={scene} className={className} />
      </Suspense>
    </SplineErrorBoundary>
  );
}
