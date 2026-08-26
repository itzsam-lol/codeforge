/**
 * Ported verbatim from apps/marketing/src/components/LogoMark.tsx — same
 * hex-nut + spark-facet geometry, so Sentinel's topbar shows the actual
 * CodeForge mark instead of a generic shield icon. `currentColor` fill, no
 * external deps, safe to copy rather than share (no shared UI package
 * exists in this monorepo — see the plan this was built from).
 */
export function LogoMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
    >
      <polygon points="19,14 15.5,20.06 8.5,20.06 5,14 8.5,7.94 15.5,7.94" fill="currentColor" />
      <rect x="8.5" y="3.5" width="3" height="3" transform="rotate(45 10 5)" fill="currentColor" />
      <rect x="12.75" y="1.25" width="2" height="2" transform="rotate(45 13.75 2.25)" fill="currentColor" />
    </svg>
  );
}
