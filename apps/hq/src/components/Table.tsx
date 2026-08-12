"use client";

import type { ReactNode, ThHTMLAttributes } from "react";
import { cn } from "@/components/ui";

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-container-low">{children}</thead>;
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({ className, onClick, children }: { className?: string; onClick?: () => void; children: ReactNode }) {
  return (
    <tr
      onClick={onClick}
      className={cn("h-8 transition-colors duration-100 even:bg-surface-container-low/40", onClick && "cursor-pointer", "hover:bg-surface-container-low", className)}
    >
      {children}
    </tr>
  );
}

export function Td({ className, children }: { className?: string; children?: ReactNode }) {
  return <td className={cn("px-3 py-2 align-middle text-on-surface", className)}>{children}</td>;
}

export function Th({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("px-3 py-2 text-label-caps text-on-surface-variant", className)} {...props}>
      {children}
    </th>
  );
}
