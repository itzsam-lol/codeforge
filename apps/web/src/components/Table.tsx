"use client";

import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/components/ui";
import { IconSort } from "@/components/icons";

/**
 * Recruiter table primitives (real <table> semantics, not divs, so
 * axe-core's table-structure rules stay satisfied). No outer box border and
 * no zebra striping — each row gets a hairline divider plus a rounded
 * highlight pill on hover (border-separate + first/last-child radius on the
 * cells, since <tr> itself can't take a border-radius). Never a bordered
 * rectangle: the "panel" the table sits in (Card) already carries the only
 * container edge, via shadow, not an outline.
 */
export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-separate border-spacing-0 text-left text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
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
    <tr onClick={onClick} className={cn("group", onClick && "cursor-pointer", className)}>
      {children}
    </tr>
  );
}

export function Td({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "border-b border-outline-variant/60 px-4 py-3 align-middle text-on-surface transition-colors duration-100 first:rounded-l-lg last:rounded-r-lg group-hover:bg-surface-container-low",
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
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
  const base = "border-b-2 border-outline-variant px-4 py-2.5 text-label-caps text-on-surface-variant";
  if (!sortable) {
    return (
      <th className={cn(base, className)} {...props}>
        {children}
      </th>
    );
  }
  return (
    <th
      aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"}
      className={cn(base, className)}
      {...props}
    >
      <button
        type="button"
        onClick={onSort}
        className="group/sort inline-flex items-center gap-1 text-label-caps text-on-surface-variant hover:text-on-surface"
      >
        {children}
        <IconSort
          size={12}
          className={cn(
            "transition-opacity duration-100",
            sorted ? "opacity-100 text-accent" : "opacity-0 group-hover/sort:opacity-60"
          )}
        />
      </button>
    </th>
  );
}
