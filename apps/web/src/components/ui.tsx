"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------

// Elevation is reserved for overlays (Modal, dropdowns); resting surfaces
// (buttons, cards) carry at most a single hairline shadow, never a glow or a
// hover-growing shadow — see the design-token notes in globals.css.
const buttonVariants = {
  primary:
    "bg-accent text-white hover:bg-accent-hover disabled:bg-accent/40 focus-visible:outline-accent",
  secondary:
    "border border-outline-variant bg-surface-container-lowest text-on-surface hover:border-outline hover:bg-surface-container-low disabled:text-on-surface-variant/60",
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
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        buttonVariants[variant],
        className
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("cf-elevation-1 rounded-xl", className)}>{children}</div>;
}

const badgeColors: Record<string, string> = {
  slate: "bg-surface-container-high text-on-surface-variant",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-rose-100 text-rose-800",
  indigo: "bg-indigo-100 text-indigo-800",
  blue: "bg-sky-100 text-sky-800",
};

export function Badge({ color = "slate", children }: { color?: keyof typeof badgeColors; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", badgeColors[color])}>
      {children}
    </span>
  );
}

export function statusBadgeColor(status: string): keyof typeof badgeColors {
  switch (status) {
    case "published":
    case "submitted":
    case "completed":
    case "graded":
    case "accepted":
      return "green";
    case "in_progress":
    case "started":
    case "running":
    case "queued":
      return "blue";
    case "auto_submitted":
    case "draft":
    case "pending":
      return "amber";
    case "revoked":
    case "expired":
    case "failed":
    case "closed":
      return "red";
    default:
      return "slate";
  }
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
  "w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-colors duration-150 ease-out focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:bg-surface-container-low disabled:text-on-surface-variant";

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
    <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
