import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/Reveal";

/**
 * Consistent section header: a small eyebrow chip, a title, and a subtitle.
 * `tone` switches between light sections (default) and dark sections.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  tone = "light",
  align = "center",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: "light" | "dark";
  align?: "center" | "left";
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <Reveal
      className={cn(
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className
      )}
    >
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium tracking-tight",
          dark
            ? "border border-white/10 bg-white/5 text-accent-soft"
            : "border border-accent/20 bg-accent/5 text-accent"
        )}
      >
        <span className="size-1.5 rounded-full bg-accent" />
        {eyebrow}
      </span>
      <h2
        className={cn(
          "mt-4 text-4xl font-semibold tracking-tight md:text-5xl",
          dark ? "text-white" : "text-slate-900"
        )}
      >
        {title}
      </h2>
      {subtitle ? (
        <p className={cn("mt-4 text-lg leading-relaxed", dark ? "text-slate-300" : "text-slate-600")}>
          {subtitle}
        </p>
      ) : null}
    </Reveal>
  );
}
