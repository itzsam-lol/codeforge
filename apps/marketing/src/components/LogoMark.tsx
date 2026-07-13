/**
 * CodeForge's mark: a hex-nut silhouette (the "forge") with two small spark
 * facets above it. Original geometry, drawn as plain polygon/rect shapes so
 * it stays legible at small sizes (nav bars, favicons) without relying on a
 * traced or imported asset. Fill is `currentColor` by default so it can sit
 * as white-on-accent (a compact nav badge) or accent-on-surface (a large
 * standalone lockup) purely via the parent's text color.
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
      <polygon
        points="19,14 15.5,20.06 8.5,20.06 5,14 8.5,7.94 15.5,7.94"
        fill="currentColor"
      />
      <rect x="8.5" y="3.5" width="3" height="3" transform="rotate(45 10 5)" fill="currentColor" />
      <rect x="12.75" y="1.25" width="2" height="2" transform="rotate(45 13.75 2.25)" fill="currentColor" />
    </svg>
  );
}
