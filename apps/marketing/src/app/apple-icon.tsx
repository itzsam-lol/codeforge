import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same geometry as icon.tsx, scaled up for the iOS home-screen icon size
// Apple actually requests (apple-touch-icon) - a 32px favicon upscaled by
// the browser looks soft there.
export default function AppleIcon() {
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
        }}
      >
        <svg width={112} height={112} viewBox="0 0 24 24" fill="none">
          <polygon points="19,14 15.5,20.06 8.5,20.06 5,14 8.5,7.94 15.5,7.94" fill="white" />
          <rect x="8.5" y="3.5" width="3" height="3" transform="rotate(45 10 5)" fill="white" />
          <rect x="12.75" y="1.25" width="2" height="2" transform="rotate(45 13.75 2.25)" fill="white" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
