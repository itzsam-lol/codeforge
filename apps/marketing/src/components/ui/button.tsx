import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-accent text-white hover:bg-accent-hover",
  outline: "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50 hover:border-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100",
  glass: "cf-glass text-white hover:bg-white/10",
} as const;

const sizes = {
  sm: "h-9 px-4 text-sm rounded-lg",
  md: "h-10 px-5 text-sm rounded-lg",
  lg: "h-12 px-7 text-base rounded-xl",
} as const;

type Variant = keyof typeof variants;
type Size = keyof typeof sizes;

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

/** Renders as a link when `href` is passed, otherwise a button. Small,
 * shadcn-shaped API (variant/size) hand-written for this app rather than
 * pulled in via the shadcn CLI, since only this one component is needed. */
export function Button({
  variant = "default",
  size = "md",
  className,
  href,
  ...props
}: CommonProps &
  (
    | ({ href: string } & AnchorHTMLAttributes<HTMLAnchorElement>)
    | ({ href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>)
  )) {
  const classes = cn(
    "inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98]",
    sizes[size],
    variants[variant],
    className
  );

  if (href) {
    return (
      <a href={href} className={classes} {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} />
    );
  }
  return <button className={classes} {...(props as ButtonHTMLAttributes<HTMLButtonElement>)} />;
}
