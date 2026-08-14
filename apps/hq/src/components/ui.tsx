"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware merge, not a plain join — mirrors apps/web's ui.tsx (see
 *  its comment): a caller's own utility must win over a conflicting one
 *  baked into the component's base class, which a plain string join can't
 *  guarantee. */
export function cn(...parts: (string | false | null | undefined)[]) {
  return twMerge(parts.filter(Boolean).join(" "));
}

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

const badgeColors = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  accent: "bg-accent-soft text-accent",
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
} as const;

export function Badge({
  color = "neutral",
  dashed,
  children,
}: {
  color?: keyof typeof badgeColors;
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
      {children}
    </span>
  );
}

/** HQ's own status vocabulary: client lifecycle, lead pipeline, provisioning run/step. */
function statusMeta(status: string): { color: keyof typeof badgeColors; dashed?: boolean } {
  switch (status) {
    case "live":
    case "succeeded":
    case "qualified":
    case "converted":
      return { color: "ok" };
    case "trial":
    case "running":
    case "contacted":
      return { color: "accent" };
    case "queued":
    case "pending":
    case "new":
      return { color: "neutral", dashed: true };
    case "churned":
    case "failed":
    case "dismissed":
      return { color: "bad" };
    case "lead":
      return { color: "info" };
    default:
      return { color: "neutral" };
  }
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const meta = statusMeta(status);
  return (
    <Badge color={meta.color} dashed={meta.dashed}>
      {label ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
    </Badge>
  );
}

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
  return <textarea {...props} className={cn(inputClass, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, props.className)} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-on-surface-variant">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-outline-variant border-t-accent" />
      {label ?? "Loading…"}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="rounded bg-bad-bg px-3 py-2 text-sm text-bad">{message}</div>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-sm font-medium text-on-surface-variant">{title}</p>
      {hint ? <p className="mt-1 text-xs text-on-surface-variant/80">{hint}</p> : null}
    </div>
  );
}
