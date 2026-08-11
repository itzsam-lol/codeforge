import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#05070f",
          backgroundImage:
            "radial-gradient(60% 60% at 50% 0%, rgba(109,91,255,0.35), transparent 70%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 88,
              height: 88,
              borderRadius: 20,
              background: "#6d5bff",
            }}
          >
            <svg width={48} height={48} viewBox="0 0 24 24" fill="none">
              <polygon points="19,14 15.5,20.06 8.5,20.06 5,14 8.5,7.94 15.5,7.94" fill="white" />
              <rect x="8.5" y="3.5" width="3" height="3" transform="rotate(45 10 5)" fill="white" />
              <rect x="12.75" y="1.25" width="2" height="2" transform="rotate(45 13.75 2.25)" fill="white" />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 600, color: "white" }}>
            CodeForge
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 32, color: "#cbd5e1" }}>
          Self-hosted technical assessments, fully white-labeled
        </div>
      </div>
    ),
    { ...size }
  );
}
