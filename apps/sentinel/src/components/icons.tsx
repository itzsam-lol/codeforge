/**
 * Ported from apps/web/src/components/icons.tsx — same lucide-style stroke
 * geometry and `base()` helper, trimmed to what Sentinel actually uses, plus
 * IconLink (apps/web has no use for a connection icon yet, so it doesn't
 * have one to port — written in the same style so it doesn't stand out).
 */
import type { SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 16, ...props }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export const IconShield = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 2.5 4 5.5v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10v-6l-8-3Z" />
    <path d="m8.5 12.2 2.4 2.4 4.6-5" />
  </svg>
);

export const IconCheckCircle = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5L15.5 9" />
  </svg>
);

export const IconAlert = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

export const IconMonitor = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

export const IconLink = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M11 7 12.6 5.4a3.6 3.6 0 0 1 5.1 5.1L16.1 12" />
    <path d="M13 17 11.4 18.6a3.6 3.6 0 0 1-5.1-5.1L7.9 12" />
  </svg>
);
