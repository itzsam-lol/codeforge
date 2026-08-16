"use client";

import { Component, type ReactNode } from "react";
import { Button, Card } from "@/components/ui";
import { IconAlert } from "@/components/icons";

interface Props {
  children: ReactNode;
  /** What to call this screen in the recovery message ("your test", "this page"). */
  label: string;
}

interface State {
  error: Error | null;
}

/**
 * A crash here used to mean a blank page with no explanation — nothing
 * caught a render exception anywhere in the candidate-facing app. Answers
 * are already safe (TestRunner autosaves continuously and reloading this
 * same link resumes with everything intact per StartCard's own copy), so
 * this only needs to replace "blank white screen" with "tell the candidate
 * what to do next."
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary] ${this.props.label} crashed:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-surface px-4">
          <Card className="cf-scale-in mx-auto max-w-sm p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bad-bg text-bad">
              <IconAlert size={22} />
            </div>
            <h1 className="mt-3 text-headline-sm text-on-surface">Something went wrong</h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {this.props.label} hit an unexpected error. Your work has been saving automatically
              &mdash; reload this page to pick up right where you left off.
            </p>
            <Button className="mt-4 w-full" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
