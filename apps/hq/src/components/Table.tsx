"use client";

import type { ReactNode, ThHTMLAttributes } from "react";
import { cn } from "@/components/ui";

/**
 * No outer box border and no zebra striping — each row gets a hairline
 * divider plus a rounded highlight pill on hover (border-separate +
 * first/last-child radius on the cells, since <tr> itself can't take a
 * border-radius). Mirrors apps/web's Table.tsx.
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

export function Tr({ className, onClick, children }: { className?: string; onClick?: () => void; children: ReactNode }) {
  return (
    <tr onClick={onClick} className={cn("group", onClick && "cursor-pointer", className)}>
      {children}
    </tr>
  );
}

export function Td({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <td
      className={cn(
        "border-b border-outline-variant/60 px-4 py-3 align-middle text-on-surface transition-colors duration-100 first:rounded-l-lg last:rounded-r-lg group-hover:bg-surface-container-low",
        className
      )}
    >
      {children}
    </td>
  );
}

export function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn("border-b-2 border-outline-variant px-4 py-2.5 text-label-caps text-on-surface-variant", className)}
      {...props}
    >
      {children}
    </th>
  );
}
