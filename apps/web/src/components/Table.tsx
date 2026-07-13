"use client";

import type { ReactNode, ThHTMLAttributes } from "react";
import { cn } from "@/components/ui";
import { IconSort } from "@/components/icons";

/**
 * High-density recruiter table primitives (real <table> semantics, not divs,
 * so axe-core's table-structure rules stay satisfied). 32px rows, slate-50
 * hover tint, label-caps column headers per the design system.
 */
export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-outline-variant">{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-outline-variant/60">{children}</tbody>;
}

export function Tr({
  className,
  onClick,
  children,
}: {
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "h-8 transition-colors duration-100",
        onClick && "cursor-pointer",
        "hover:bg-surface-container-low",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function Td({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("px-3 py-2 align-middle text-on-surface", className)}>{children}</td>;
}

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  sortable?: boolean;
  sorted?: "asc" | "desc" | false;
  onSort?: () => void;
  children?: ReactNode;
}

/** Plain header cell, or a sortable one exposing a hover-revealed sort icon
 * (never hover-only for the underlying affordance: sortable columns are
 * always buttons, so keyboard/screen-reader users can trigger sort without
 * relying on :hover). */
export function Th({ sortable, sorted, onSort, className, children, ...props }: ThProps) {
  if (!sortable) {
    return (
      <th
        className={cn("px-3 py-2 text-label-caps text-on-surface-variant", className)}
        {...props}
      >
        {children}
      </th>
    );
  }
  return (
    <th
      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"}
      className={cn("px-3 py-2 text-label-caps text-on-surface-variant", className)}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        className="group inline-flex items-center gap-1 text-label-caps text-on-surface-variant hover:text-on-surface"
      >
        {children}
        <IconSort
          size={12}
          className={cn(
            "transition-opacity duration-100",
            sorted ? "opacity-100 text-accent" : "opacity-0 group-hover:opacity-60"
          )}
        />
      </button>
    </th>
  );
}
