import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Generated at build/request time from the same geometry as LogoMark.tsx
// (a plain SVG component can't be reused directly inside ImageResponse, so
// the polygon/rect shapes are duplicated here) — no external asset file
// needed for a favicon.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#6d5bff",
          borderRadius: 7,
        }}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none">
          <polygon points="19,14 15.5,20.06 8.5,20.06 5,14 8.5,7.94 15.5,7.94" fill="white" />
          <rect x="8.5" y="3.5" width="3" height="3" transform="rotate(45 10 5)" fill="white" />
          <rect x="12.75" y="1.25" width="2" height="2" transform="rotate(45 13.75 2.25)" fill="white" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
