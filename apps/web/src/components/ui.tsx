"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------

// Primary is the one control allowed a shadow + a 1px hover-lift — a single
// deliberate motion on the one call-to-action per view, not a "everything
// lifts on hover" habit. Every other variant stays flat.
const buttonVariants = {
  primary:
    "bg-accent text-white shadow-[0_14px_30px_-18px_var(--color-accent)] hover:-translate-y-px hover:bg-accent-hover disabled:bg-accent/40 disabled:shadow-none disabled:hover:translate-y-0 focus-visible:outline-accent",
  secondary:
    "bg-surface-container text-on-surface hover:bg-surface-container-high disabled:text-on-surface-variant/60",
  danger: "bg-rose-600 text-white hover:bg-rose-700 disabled:bg-rose-300",
  ghost: "text-on-surface-variant hover:bg-surface-container-low disabled:text-on-surface-variant/40",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants;
  size?: "sm" | "md";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-control font-medium transition duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("cf-elevation-1 rounded-container", className)}>{children}</div>;
}

// Semantic status vocabulary (fixed, never derived from the swappable brand
// accent) plus "accent" for transient/active states and "neutral" for
// inert ones — see the Colour section of the design spec. Old palette names
// are kept as aliases so existing call sites across the app didn't all need
// a rename in the same pass; new code should reach for the semantic names.
const badgeColors = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
  // aliases
  slate: "bg-surface-container-high text-on-surface-variant",
  green: "bg-ok-bg text-ok",
  amber: "bg-warn-bg text-warn",
  red: "bg-bad-bg text-bad",
  blue: "bg-info-bg text-info",
  indigo: "bg-accent-soft text-accent",
} as const;

const STATUS_ICON_SRC = {
  pass: "/status-icons/status-pass.png",
  flag: "/status-icons/status-flag.png",
  fail: "/status-icons/status-fail.png",
  info: "/status-icons/status-info.png",
} as const;
export type StatusIcon = keyof typeof STATUS_ICON_SRC;

export function Badge({
  color = "neutral",
  icon,
  dashed,
  children,
}: {
  color?: keyof typeof badgeColors;
  icon?: StatusIcon;
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        dashed ? "bg-surface-container-high text-on-surface-variant" : badgeColors[color]
      )}
    >
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={STATUS_ICON_SRC[icon]} alt="" width={14} height={14} className="h-3.5 w-3.5 shrink-0" />
      ) : null}
      {children}
    </span>
  );
}

interface StatusMeta {
  color: keyof typeof badgeColors;
  icon?: StatusIcon;
  dashed?: boolean;
}

/**
 * The full status vocabulary in one place: TestStatus, InvitationStatus,
 * SessionStatus, SubmissionStatus all funnel through this, matching the
 * design spec's "Status vocabulary" section exactly.
 */
function statusMeta(status: string): StatusMeta {
  switch (status) {
    case "published":
    case "submitted":
    case "completed":
    case "graded":
    case "accepted":
      return { color: "ok", icon: "pass" };
    case "in_progress":
    case "started":
      return { color: "accent" };
    case "queued":
    case "running":
      return { color: "warn" };
    case "auto_submitted":
      return { color: "warn", icon: "flag" };
    case "expired":
      return { color: "warn", icon: "flag" };
    case "revoked":
    case "failed":
      return { color: "bad", icon: "fail" };
    case "closed":
      return { color: "info" };
    case "opened":
      return { color: "info" };
    case "draft":
    case "created":
      return { color: "neutral", dashed: true };
    case "archived":
    case "pending":
      return { color: "neutral" };
    default:
      return { color: "neutral" };
  }
}

/** Back-compat: some call sites only want the color to build their own Badge. */
export function statusBadgeColor(status: string): keyof typeof badgeColors {
  return statusMeta(status).color;
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const meta = statusMeta(status);
  return (
    <Badge color={meta.color} icon={meta.icon} dashed={meta.dashed}>
      {label ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </Badge>
  );
}

// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-on-surface-variant">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-on-surface-variant/80">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "w-full rounded-control bg-surface-container px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-surface-container-low disabled:text-on-surface-variant";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "font-mono text-xs leading-relaxed", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, props.className)} />;
}

// ---------------------------------------------------------------------------

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-on-surface-variant">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-outline-variant border-t-accent" />
      {label ?? "Loading…"}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-medium text-on-surface-variant">{title}</p>
      {hint ? <p className="mt-1 text-xs text-on-surface-variant/80">{hint}</p> : null}
    </div>
  );
}
