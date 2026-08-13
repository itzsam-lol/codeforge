import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CodeForge",
    short_name: "CodeForge",
    description: "Self-hosted, white-label technical assessment platform.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#05070f",
    icons: [{ src: "/icon", sizes: "32x32", type: "image/png" }],
  };
}
